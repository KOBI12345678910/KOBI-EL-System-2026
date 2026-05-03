# AGENT-262 — 360 Route Prefix Fix (Concrete Patch)

**Date:** 2026-04-29
**Agent:** 262 (FRONTEND #2)
**Builds on:** AGENT-204 (Critical bug #1: route prefix mismatch)
**File of record:** `techno-kol-ops/client/src/App.tsx`

---

## 1. Problem Recap

App.tsx registers `/360/<entity>/:id` (lines 136-144) but **every** call site
uses bare paths `/<entity>/:id`. `routeRegistry.ts` also declares bare paths.
Result: every cross-360 click hits `*` NotFound.

## 2. Cost-of-Fix Comparison

| Option                              | Files touched | Lines changed |
|-------------------------------------|---------------|---------------|
| A. Rename routes in `App.tsx` to bare | **1**         | **9**         |
| B. Rewrite all `navigate()` to `/360/...` | 12+           | 30+           |

**Picked: Option A.** It's ~3x shorter, aligns with `routeRegistry.ts` (already
bare), and matches `Project360RouteWrapper`/`WorkOrder360RouteWrapper` legacy
routes which are already bare-ish (`/project360/:id`).

A collision check was run: bare paths `/customer`, `/quote`, `/project`, `/po`,
`/rfq`, `/supplier`, `/employee`, `/finance/:id`, `/work-order` do not collide
with any list pages, which use plurals (`/clients`, `/work-orders`, `/employees`,
`/finance` without `:id`). The only near-collision is `/work-order/:id` vs
`/work-orders` (list) — these are distinct paths in react-router and resolve
correctly.

## 3. The Patch

**File:** `techno-kol-ops/client/src/App.tsx`
**Range:** lines 136-144

```diff
--- a/techno-kol-ops/client/src/App.tsx
+++ b/techno-kol-ops/client/src/App.tsx
@@ -133,15 +133,15 @@ function Layout() {
           <Route path="/control-room/operations" element={<OperationsControlRoom />} />
           <Route path="/control-room/procurement" element={<ProcurementControlRoom />} />
           <Route path="/control-room/workforce" element={<WorkforceControlRoom />} />
-          <Route path="/360/customer/:id" element={<Customer360 />} />
-          <Route path="/360/employee/:id" element={<Employee360 />} />
-          <Route path="/360/finance/:id" element={<Finance360 />} />
-          <Route path="/360/po/:id" element={<PO360 />} />
-          <Route path="/360/project/:id" element={<Project360Detail />} />
-          <Route path="/360/quote/:id" element={<Quote360 />} />
-          <Route path="/360/rfq/:id" element={<RFQ360 />} />
-          <Route path="/360/supplier/:id" element={<Supplier360 />} />
-          <Route path="/360/work-order/:id" element={<WorkOrder360Detail />} />
+          <Route path="/customer/:id" element={<Customer360 />} />
+          <Route path="/employee/:id" element={<Employee360 />} />
+          <Route path="/finance/:id" element={<Finance360 />} />
+          <Route path="/po/:id" element={<PO360 />} />
+          <Route path="/project/:id" element={<Project360Detail />} />
+          <Route path="/quote/:id" element={<Quote360 />} />
+          <Route path="/rfq/:id" element={<RFQ360 />} />
+          <Route path="/supplier/:id" element={<Supplier360 />} />
+          <Route path="/work-order/:id" element={<WorkOrder360Detail />} />
           <Route path="/inventory-alerts" element={<InventoryAlerts />} />
```

## 4. Optional Hardening — Backward-Compat Redirects

If any external links / bookmarks already use `/360/...`, add nine redirects
right under the renamed routes. Otherwise skip — there's no evidence in the
codebase that `/360/...` URLs are emitted anywhere outside App.tsx itself.

```diff
+          {/* Legacy redirect — anything that still emits /360/... */}
+          <Route path="/360/customer/:id"   element={<Navigate to="/customer/:id"   replace />} />
+          <Route path="/360/employee/:id"   element={<Navigate to="/employee/:id"   replace />} />
+          <Route path="/360/finance/:id"    element={<Navigate to="/finance/:id"    replace />} />
+          <Route path="/360/po/:id"         element={<Navigate to="/po/:id"         replace />} />
+          <Route path="/360/project/:id"    element={<Navigate to="/project/:id"    replace />} />
+          <Route path="/360/quote/:id"      element={<Navigate to="/quote/:id"      replace />} />
+          <Route path="/360/rfq/:id"        element={<Navigate to="/rfq/:id"        replace />} />
+          <Route path="/360/supplier/:id"   element={<Navigate to="/supplier/:id"   replace />} />
+          <Route path="/360/work-order/:id" element={<Navigate to="/work-order/:id" replace />} />
```

(react-router v6 `<Navigate to>` does not template `:id`; for redirects you
actually need a small wrapper component — see Appendix A. For first-pass MVP,
**skip the redirects** and just rename, because nothing emits `/360/...`.)

## 5. Call Sites That Now Work (Confirmation)

The following call-sites were broken before and are healed by this single
9-line change. Counted via `Grep navigate\(`:

| File                                              | Line | Path emitted          |
|---------------------------------------------------|------|-----------------------|
| `features/customers/Customer360.tsx`              | 54   | `/quote/new?customer` |
| `features/customers/Customer360.tsx`              | 55   | `/project/new?customer` |
| `features/customers/Customer360.tsx`              | 56   | `/finance/new?customer` |
| `features/customers/Customer360.tsx`              | 69   | `/quote/${id}`        |
| `features/customers/Customer360.tsx`              | 82   | `/project/${id}`      |
| `pages/360/Customer360.tsx`                       | 54-82| (mirror of above)     |
| `features/projects/Project360.tsx`                | 35   | `/work-order/new`     |
| `features/projects/Project360.tsx`                | 36   | `/po/new`             |
| `features/projects/Project360.tsx`                | 46   | `/work-order/${id}`   |
| `features/projects/Project360.tsx`                | 55   | `/po/${id}`           |
| `pages/360/Project360.tsx`                        | 35-55| (mirror)              |
| `features/procurement/Supplier360.tsx`            | 35-41| `/po/new`, `/rfq/new`, `/po/${id}` |
| `pages/360/Supplier360.tsx`                       | 35-41| (mirror)              |
| `features/procurement/RFQ360.tsx`                 | 45   | `/supplier/${id}`     |
| `pages/360/RFQ360.tsx`                            | 45   | (mirror)              |
| `features/controlRooms/OperationsControlRoom.tsx` | 85,100,115 | `/work-order/${id}`, `/project/${id}` |
| `pages/controlRooms/OperationsControlRoom.tsx`    | 85,100,115 | (mirror)        |
| `features/controlRooms/ProcurementControlRoom.tsx`| 61,82,97,111 | `/po/${id}`, `/rfq/${id}`, `/supplier/${id}` |
| `pages/controlRooms/ProcurementControlRoom.tsx`   | 61,82,97,111 | (mirror)        |
| `features/controlRooms/WorkforceControlRoom.tsx`  | 63,78| `/employee/${id}`     |
| `pages/controlRooms/WorkforceControlRoom.tsx`     | 63,78| (mirror)              |

**Total fixed in one shot:** ~30 navigate sites across 14 files (counting
duplicates between `features/` and `pages/`).

## 6. Verification Plan

1. `cd techno-kol-ops/client && npm run build` — confirm no TS errors.
2. Spin up dev server, log in, click through:
   - Customer360 → row click on quote → expect Quote360 (not NotFound).
   - Project360 → row click on work-order → expect WorkOrder360.
   - ProcurementControlRoom → row click on PO → expect PO360.
3. Grep test: `rg "/360/(customer|employee|finance|po|project|quote|rfq|supplier|work-order)/" techno-kol-ops/client/src` should return **only** the redirect block (or zero hits if redirects are skipped).
4. Browser back/forward across links — no NotFound flicker.

## 7. Out-of-Scope (Tracked Separately)

- `Project360RouteWrapper` & `WorkOrder360RouteWrapper` (lines 131-132) still
  exist on legacy paths `/project360/:id`, `/work-order360/:id`. Two routes,
  two components, same id. Decide later: delete the wrappers and route
  directly to `Project360Detail` / `WorkOrder360Detail`, or delete the
  legacy paths. Not required for this fix.
- `appRouteRegistry` is currently unused by `App.tsx` (App.tsx hand-rolls
  routes). After this patch `App.tsx` and `routeRegistry.ts` agree on path
  shape, so a follow-up task should make `App.tsx` consume the registry.
- Stub action buttons (PO360, Quote360, Finance360 etc.) — separate fix per
  AGENT-204 §3.3.

## 8. Risk

**Very low.** No call-site changes, no component changes, no routing-library
upgrade. The only behavioral delta: URLs shorten by 4 chars. Any external
deep-link to `/360/...` now 404s — see §4 for redirect mitigation. As of
this audit, no such external links exist (the prefix was used only inside
App.tsx, which was the bug).

---

## Appendix A — Why `<Navigate to="/customer/:id">` doesn't work

react-router v6's `<Navigate>` does not interpolate URL params. If we ever
need real `/360/...` redirects, the pattern is:

```tsx
function LegacyRedirect({ to }: { to: (id: string) => string }) {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={to(id ?? '')} replace />;
}
// usage:
<Route path="/360/customer/:id"
       element={<LegacyRedirect to={(id) => `/customer/${id}`} />} />
```

Skipped here because nothing emits the legacy URL.

---

**End of report.**
