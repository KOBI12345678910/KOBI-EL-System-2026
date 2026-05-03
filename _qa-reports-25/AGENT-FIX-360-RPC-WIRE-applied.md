# AGENT-FIX-360-RPC-WIRE — Applied

**Date:** 2026-04-29
**Scope:** Re-wire 2 broken 360 pages to call the correct Patch 19 RPCs deployed to live Supabase (`ponypxhushxeskxgrmha`).

## Context

Patch 19 deployed 6 new RPCs to the live Supabase instance:

- `commercial.rpc_get_lead_360`
- `commercial.rpc_get_order_360`
- `procurement.rpc_get_inventoryitem_360`
- `execution.rpc_get_delivery_360`
- `finance.rpc_get_payment_360`
- `execution.rpc_get_closure_360`

Audit revealed 2 frontend 360 pages were still calling the legacy `_fast` RPC names instead of the new Patch 19 RPCs. These were silently failing in the browser (RPC name not found on the server).

## Files Changed

1. `techno-kol-ops/client/src/pages/360/InventoryItem360.tsx`
2. `techno-kol-ops/client/src/pages/360/Closure360.tsx`

Both data-fetch calls now point to the correct Patch 19 RPC names. RPC functions are GRANTed to the `authenticated` role, so calling them with the bare name (no schema prefix) works through PostgREST's default search path.

## Diff — InventoryItem360.tsx

**Before (line 15):**

```ts
    supabase.rpc("get_inventory_item_360_fast", { p_item_id: Number(id) })
      .then(({ data: p, error: e }) => { if (e) setError(e.message); else setData(p); setLoading(false); });
```

**After (line 15):**

```ts
    supabase.rpc("rpc_get_inventoryitem_360", { p_item_id: Number(id) })
      .then(({ data: p, error: e }) => { if (e) setError(e.message); else setData(p); setLoading(false); });
```

> Note: the `הדפס תווית` (Print Label) ActionBtn at line 55 still opens `/api/inventory/${id}/label` — that is a separate UI action that opens a label PDF in a new tab and is unrelated to the page's data-fetch. Left untouched per scope.

## Diff — Closure360.tsx

**Before (line 15):**

```ts
    supabase.rpc("get_closure_360_fast", { p_project_id: Number(id) })
      .then(({ data: p, error: e }) => { if (e) setError(e.message); else setData(p); setLoading(false); });
```

**After (line 15):**

```ts
    supabase.rpc("rpc_get_closure_360", { p_project_id: Number(id) })
      .then(({ data: p, error: e }) => { if (e) setError(e.message); else setData(p); setLoading(false); });
```

> Note: the `הפק תעודת סיום` (Generate Completion Certificate) ActionBtn at line 58 still opens `/api/projects/${id}/completion-cert` — that is a separate UI action for issuing a printable completion certificate (server-rendered PDF) and is unrelated to the page's data-fetch. Left untouched per scope.

## Verification

Grep confirms:

- Both files now call `supabase.rpc("rpc_get_*_360", ...)` with the correct Patch 19 names.
- No remaining references to the legacy `get_inventory_item_360_fast` or `get_closure_360_fast` names exist in `techno-kol-ops/client/src/pages/360/`.
- Pattern matches the in-codebase convention used by Lead360.tsx and Order360.tsx (which still call their `_fast` variants until Patch 19 frontend wiring rolls out for those entities — handled separately).

## Param shape — sanity check

| Page             | RPC name                         | Param          | Cast              |
| ---------------- | -------------------------------- | -------------- | ----------------- |
| InventoryItem360 | `rpc_get_inventoryitem_360`      | `p_item_id`    | `Number(id)`      |
| Closure360       | `rpc_get_closure_360`            | `p_project_id` | `Number(id)`      |

Both match the deployed Patch 19 signatures.

## Status

Applied. Not committed.
