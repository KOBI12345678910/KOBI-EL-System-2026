# AGENT-281 — NAV #1: Customer360 → Quote360 → Order360

**Scope:** Trace navigation flow across the 3 hops. Verify clickability, URL resolution, and entity-ID propagation by reading the actual code (no runtime).

**Verdict:** PARTIAL PASS — first hop has a route mismatch; final hop is **broken / missing**.

---

## Files inspected (active code paths)

| Role | File |
|---|---|
| Router config (active, mounted in `main.tsx`) | `techno-kol-ops/client/src/App.tsx` |
| Router bootstrap | `techno-kol-ops/client/src/main.tsx` |
| Customer 360 page | `techno-kol-ops/client/src/pages/360/Customer360.tsx` |
| Quote 360 page | `techno-kol-ops/client/src/pages/360/Quote360.tsx` |
| Shared 360 building blocks | `techno-kol-ops/client/src/pages/360/shared360.tsx` |
| Parallel/unused registry | `techno-kol-ops/client/src/router/routeRegistry.ts` |
| Entity / pipeline definitions | `onyx-procurement/src/pipeline/pipeline-engine.js`, `state-machines.js` |

---

## Active route table (`App.tsx` lines 100–151)

`main.tsx` mounts `<App/>` inside `BrowserRouter`. The only `<Routes>` rendered there contains, among others:

```
/360/customer/:id   → Customer360
/360/quote/:id      → Quote360
/360/po/:id         → PO360
/360/work-order/:id → WorkOrder360Detail
```

There is **no** `/360/order/:id`, no `/order/:id`, and no `Order360` component anywhere in `pages/360/` or `features/`. The directory listing confirms only 9 360 pages exist:
`Customer360, Employee360, Finance360, PO360, Project360, Quote360, RFQ360, Supplier360, WorkOrder360`.

`routeRegistry.ts` (a parallel declaration that is **not imported anywhere in the runtime tree**) uses bare paths like `/quote/:id` without the `/360/` prefix — confirming there is dead/duplicate routing config in the repo. Only `App.tsx` is wired.

---

## Hop 1 — Customer360 → Quote360

**Source:** `pages/360/Customer360.tsx` lines 60–70

```tsx
<RelatedTable
  title="הצעות מחיר"
  rows={data.quotes ?? []}
  onRowClick={(r) => navigate(`/quote/${r.id}`)}   // <-- bug
/>
```

**Header action button** (line 54):
```tsx
<ActionBtn label="הצעת מחיר חדשה" onClick={() => navigate(`/quote/new?customer=${id}`)} />
```

| Check | Result |
|---|---|
| Row is clickable (`<tr onClick>` in `RelatedTable`) | YES — `shared360.tsx` `RelatedTable` wires `onRowClick` |
| Entity ID propagates | YES — `r.id` is interpolated into the URL |
| URL **resolves to a route** | **NO** — navigates to `/quote/123`, but the registered route is `/360/quote/:id`. This will fall through to the catch-all `<Route path="*" element={<NotFound/>}>` |
| "Customer ID" propagates to "new quote" form | YES via querystring `?customer=${id}`, **but** target `/quote/new` is also unregistered → NotFound |

**Severity: HIGH.** Every quote row click and "new quote" CTA from Customer360 lands on the 404 page. Both `pages/360/Customer360.tsx` and the duplicate `features/customers/Customer360.tsx` have the same bug (grep confirmed identical strings on both files).

**Fix:** change to `navigate(\`/360/quote/${r.id}\`)` and `navigate(\`/360/quote/new?customer=${id}\`)` (and add a `/360/quote/new` route — currently there is no "new quote" route at all in the active router).

---

## Hop 2 — Quote360 page itself

**Source:** `pages/360/Quote360.tsx`

- Loads via `supabase.rpc("get_quote_360_fast", { p_quote_id: Number(id) })` using `useParams<{id:string}>()` — `id` propagation from URL is correct, **once you reach the page**.
- Page renders header, KPIs, line items, documents, audit log via `Page360 / RelatedTable / AuditLog` from `shared360.tsx`.
- No "Customer" backlink — there is no clickable link from Quote360 back to Customer360 (the customer name in the subtitle is plain text). Minor, but breaks the "every page has Where am I / Related records" rule from CLAUDE.md.

**Two primary actions on Quote360 (lines 34–37):**

```tsx
<ActionBtn label="שלח ללקוח" onClick={() => {}} />
<ActionBtn label="המר להזמנה" onClick={() => {}} variant="secondary" />
```

| Check | Result |
|---|---|
| Buttons render | YES |
| Buttons clickable | YES (the `<button>` element fires) |
| Buttons **do anything** | **NO** — both `onClick`s are empty arrow functions. No navigation, no API call, no state update, no toast. Pure no-op. |

**Severity: HIGH.** "Convert to Order" is the explicit Quote→Order pipeline transition; it is unimplemented. Same bug exists in `features/quotes/Quote360.tsx`.

---

## Hop 3 — Quote360 → Order360

**Result:** **NAVIGATION DOES NOT EXIST.**

1. The "המר להזמנה" (Convert to Order) button is a no-op (see Hop 2). No `navigate(...)` call, no API call to a `/api/quotes/:id/convert` endpoint.
2. There is no `Order360` component in the codebase (verified by directory listing of `pages/360/` and grep for `Order360`).
3. There is no route matching `/order`, `/360/order`, `/sales-order`, or `/360/sales-order` in `App.tsx`.
4. The entity itself **is defined** in the data layer:
   - `pipeline-engine.js:20` — pipeline stage `id:'order'` (Sales Order / Contract)
   - `state-machines.js:61` — full `sales_order` state machine
   - `quote-builder.js:714` — backend method `QuoteBuilder.convertToOrder(quote)` exists with a guard (must be accepted/won)

So the data/state-machine/backend side is partially ready, but **the UI hop is missing entirely**: no page, no route, no wired button. Even if the user manually typed a URL there is nothing to land on.

**Severity: CRITICAL** for the Master Flow `Quote → Approval → Order` segment. This is one of the 9 P0 360 pages per CLAUDE.md, and it is absent.

---

## ID propagation summary

| Hop | Source ID | Carrier | Target reads | Works? |
|---|---|---|---|---|
| Customer → quote-row click | `quotes[i].id` from RPC | URL path | `useParams.id` in Quote360 | **No** — wrong path prefix |
| Customer → new-quote CTA | `useParams.id` (customer) | querystring `?customer=` | nothing reads it (route 404s) | **No** |
| Quote → Convert-to-Order | `useParams.id` (quote) | — | — | **No** — handler is `() => {}` |

---

## Recommended fixes (priority order)

1. **P0** — Replace `navigate(\`/quote/${r.id}\`)` with `navigate(\`/360/quote/${r.id}\`)` in both Customer360 copies (`pages/360/` and `features/customers/`). Same for the "new quote" CTA, and register a `/360/quote/new` route (or use a modal).
2. **P0** — Implement `Order360.tsx` and register `<Route path="/360/order/:id" element={<Order360/>}/>`. Mirror the existing 360 pattern (`Page360`, KPIs, line items, audit log; RPC `get_sales_order_360_fast`).
3. **P0** — Wire Quote360's "המר להזמנה" button to call `QuoteBuilder.convertToOrder` (backend exists), then `navigate(\`/360/order/${newOrderId}\`)`. Wire "שלח ללקוח" to whatever send-quote API exists (likely `quotes.send`).
4. **P1** — Add a clickable customer name in Quote360 subtitle linking back to `/360/customer/:customerId` to satisfy "Where am I / Related records".
5. **P2** — Reconcile or delete `client/src/router/routeRegistry.ts`. It declares a parallel, incompatible URL scheme (`/quote/:id` vs `/360/quote/:id`) and is never imported, creating drift risk.

---

## Notes / caveats

- I could not execute the dev server in this read-only trace — verdicts above are static-analysis only. A runtime nav test would land on `NotFound.tsx` for hop 1 and produce a dead button for hop 2/3.
- Two duplicate Customer360 / Quote360 trees coexist (`pages/360/...` and `features/.../...`) with identical bugs. Whichever is bundled, the user-visible behavior is the same. Consolidating these is a separate cleanup task.
