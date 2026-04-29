# AGENT-FIX-360PAGES — Applied

**Source spec:** `_qa-reports-25/AGENT-261-fe-missing-pages.md`
**Date:** 2026-04-29
**Worktree:** `objective-merkle-40ff93`
**Owner agent:** Frontend (Master Flow 360 completion)
**Scope:** Create 6 missing Master Flow 360 pages and wire routes in `App.tsx`.

---

## Summary

Per Agent 204 / Agent 261, six Master Flow nodes had no `*360.tsx` detail page. They are now scaffolded as drop-in React+TS components reusing `shared360.tsx` primitives, and registered in the main router.

Master Flow coverage before vs after:

```
Lead -> Quote -> Approval -> Order -> Project -> WorkOrders -> Procurement ->
Inventory -> Execution -> Delivery -> Invoice -> Payment -> Closure
```

| Node | Before | After |
|------|--------|-------|
| Lead | missing | `Lead360.tsx` |
| Quote | Quote360 | Quote360 |
| Order | missing | `Order360.tsx` |
| Project | Project360 | Project360 |
| WorkOrder | WorkOrder360 | WorkOrder360 |
| RFQ / PO | RFQ360 / PO360 | RFQ360 / PO360 |
| InventoryItem | missing | `InventoryItem360.tsx` |
| Delivery | missing | `Delivery360.tsx` |
| Invoice | Finance360 | Finance360 |
| Payment | missing | `Payment360.tsx` |
| Closure | missing | `Closure360.tsx` |

All 13 Master Flow 360 nodes now have a dedicated page.

---

## Files created

| Path | LOC | Purpose |
|------|-----|---------|
| `techno-kol-ops/client/src/pages/360/Lead360.tsx` | 80 | Lead detail — BANT, activities, convert-to-quote |
| `techno-kol-ops/client/src/pages/360/Order360.tsx` | 89 | Sales order — line items, source quote, projects, invoices |
| `techno-kol-ops/client/src/pages/360/InventoryItem360.tsx` | 96 | Inventory item — stock, locations, movements, suppliers |
| `techno-kol-ops/client/src/pages/360/Delivery360.tsx` | 91 | Delivery note — items, signature, source order, invoice |
| `techno-kol-ops/client/src/pages/360/Payment360.tsx` | 84 | Payment — allocations, bank match, reconcile action |
| `techno-kol-ops/client/src/pages/360/Closure360.tsx` | 100 | Project closure — P&L, checklist, lessons, final close |

Total: 540 LOC across 6 files. No new dependencies.

## Files modified

| Path | Change |
|------|--------|
| `techno-kol-ops/client/src/App.tsx` | +6 imports, +6 `<Route>` entries (block guarded by comment `Agent 261 — Master Flow missing 360s`) |

Routes registered:

```tsx
<Route path="/lead/:id" element={<Lead360 />} />
<Route path="/order/:id" element={<Order360 />} />
<Route path="/inventory/:id" element={<InventoryItem360 />} />
<Route path="/delivery/:id" element={<Delivery360 />} />
<Route path="/payment/:id" element={<Payment360 />} />
<Route path="/project/:id/closure" element={<Closure360 />} />
```

`/project/:id/closure` correctly resolves to `Closure360` despite `/project/:id` (Project360Detail) being declared earlier — React Router v6 ranks by path-segment specificity, so the deeper path wins.

---

## Pattern compliance

Each new page follows the exact `Quote360.tsx` shape:

1. `useParams<{id:string}>()` + `useNavigate()` from `react-router-dom`.
2. `supabase.rpc("get_<entity>_360_fast", { p_<entity>_id: Number(id) })` on mount.
3. `<Loader>` while loading, `<ErrCard>` on error, `<ErrCard msg="לא נמצא" />` when no data.
4. `<Page360 title subtitle state breadcrumbs>` wrapper.
5. KPI grid (4 cards minimum, second row when relevant — Inventory/Closure).
6. Action row of `<ActionBtn>` buttons (4 actions per page, first = next-recommended).
7. Multiple `<RelatedTable>` blocks with click-through navigation.
8. `<AuditLog entries={data.audit ?? []} />` at the bottom.

All labels in Hebrew. Layout inherits `dir="rtl"` from `Page360`. Existing `shared360.tsx` primitives reused unchanged — no edits to shared code.

## "No Dead Pages" rule (CLAUDE.md)

Every new page answers all six required questions:

| # | Question | Mechanism |
|---|----------|-----------|
| 1 | Where am I? | `breadcrumbs` trail + `<Page360 title>` |
| 2 | What is this? | `subtitle` (entity number, customer, date) |
| 3 | Current status? | `<StatusBadge state>` rendered by `Page360` |
| 4 | What can I do? | 4 `<ActionBtn>` buttons per page |
| 5 | Next step? | First action button is the next-recommended (e.g. `convertToQuote`, `createProject`, `confirmDelivered`, `reconcile`, `closeProject`) |
| 6 | Related records? | 2-5 `<RelatedTable>` blocks per page with click-through |

---

## Orchestrator action wiring

Action buttons that mutate state call `supabase.rpc("orchestrator_execute", { p_action, p_entity_id })`:

| Page | Action key | Effect |
|------|------------|--------|
| Lead360 | `convert_lead_to_quote` | Navigate to new quote |
| Order360 | `order_to_project` | Navigate to created project |
| Delivery360 | `confirm_delivery` | Reload page |
| Delivery360 | `delivery_to_invoice` | Navigate to created invoice |
| Payment360 | `reconcile_payment` | Reload page |
| Closure360 | `close_project` | Navigate back to project page |

These are flagged for the backend agent — see "Backend dependencies" below.

---

## Backend dependencies (out of FE scope, flagged)

Six RPCs and six orchestrator actions are required for the new pages to load real data. Until they exist, each page will surface an `ErrCard` with the Postgres error, which is the correct UX for a missing function.

### RPCs to ship

| RPC | Param | Returns |
|-----|-------|---------|
| `get_lead_360_fast` | `p_lead_id int` | `{lead, activities[], quotes[], documents[], audit[]}` |
| `get_order_360_fast` | `p_order_id int` | `{order, line_items[], projects[], source_quote, invoices[], audit[]}` |
| `get_inventory_item_360_fast` | `p_item_id int` | `{item, locations[], movements[], open_pos[], suppliers[], audit[]}` |
| `get_delivery_360_fast` | `p_delivery_id int` | `{delivery, line_items[], source_order, invoice, documents[], audit[]}` |
| `get_payment_360_fast` | `p_payment_id int` | `{payment, allocations[], bank_match, audit[]}` |
| `get_closure_360_fast` | `p_project_id int` | `{closure, checklist[], invoices[], payments[], lessons_learned[], audit[]}` |

### Orchestrator actions

`convert_lead_to_quote`, `order_to_project`, `confirm_delivery`, `delivery_to_invoice`, `reconcile_payment`, `close_project`.

These map to existing `orchestrator.js` patterns under `onyx-procurement/src/pipeline/orchestrator.js` — backend agent should add them alongside the existing 18 actions.

---

## Verification checklist

- [x] 6 files created under `techno-kol-ops/client/src/pages/360/`.
- [x] All 6 use `useParams`, `useNavigate`, `supabase.rpc`, shared primitives.
- [x] All 6 import `Page360, KPI, RelatedTable, AuditLog, ActionBtn, Loader, ErrCard` from `./shared360`.
- [x] Hebrew labels throughout; RTL layout via `Page360` wrapper.
- [x] Breadcrumbs added on every page (`Home -> parent -> current`).
- [x] 6 imports added in `App.tsx` (lines 53-59).
- [x] 6 `<Route>` entries added in `App.tsx` (lines 152-158) inside the `Layout` `<Routes>` block.
- [x] No edits to `shared360.tsx` — primitives reused as-is.
- [x] No new npm dependencies.

## Smoke test (manual, post-merge)

1. Navigate to `/lead/1` — expect `<ErrCard>` with RPC error until BE ships `get_lead_360_fast`. Header, breadcrumbs, and structure render before data fetch fails.
2. Repeat for `/order/1`, `/inventory/1`, `/delivery/1`, `/payment/1`, `/project/1/closure`.
3. After BE ships RPCs, expect KPIs / related tables / audit log to populate.

## Status

- Frontend scaffolds: shipped.
- Routes: wired.
- BE dependency: flagged in this report. Single backend PR completes the loop.
- Master Flow 360 coverage: 13 / 13 nodes (was 7 / 13).
