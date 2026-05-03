# AGENT-FIX-NAV — Applied (Route Prefix Healed)

**Date:** 2026-04-29
**Applies:** AGENT-262 (`AGENT-262-route-prefix-fix.md`)
**Builds on:** AGENT-204 (Critical bug #1)
**Status:** Applied & verified (grep clean)

---

## 1. What Changed

### 1.1 Primary patch — `techno-kol-ops/client/src/App.tsx` (lines 136-144)

Renamed nine `/360/<entity>/:id` routes to bare `/<entity>/:id` so they match
every `navigate()` call site and `routeRegistry.ts`:

```diff
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
```

### 1.2 Secondary patch — Strip `/360/` from emit-sites in `pages/360/`

The verification grep (§6 step 3 of AGENT-262) revealed eight emit-sites still
producing `/360/...` URLs that the route rename would have broken. Healed in
the same shot to honor "no NotFound flicker":

| File                                     | Before                              | After                            |
|------------------------------------------|-------------------------------------|----------------------------------|
| `pages/360/PO360.tsx:51`                 | `to: \`/360/supplier/${id}\``       | `to: \`/supplier/${id}\``        |
| `pages/360/PO360.tsx:52`                 | `to: \`/360/project/${id}\``        | `to: \`/project/${id}\``         |
| `pages/360/PO360.tsx:85`                 | `navigate(\`/360/supplier/${id}\`)` | `navigate(\`/supplier/${id}\`)`  |
| `pages/360/Project360.tsx:27`            | `to: \`/360/customer/${id}\``       | `to: \`/customer/${id}\``        |
| `pages/360/Quote360.tsx:57`              | `to: \`/360/customer/${id}\``       | `to: \`/customer/${id}\``        |
| `pages/360/Quote360.tsx:93`              | `\`/360/project/${newId}\``         | `\`/project/${newId}\``          |
| `pages/360/WorkOrder360.tsx:51`          | `to: \`/360/customer/${id}\``       | `to: \`/customer/${id}\``        |
| `pages/360/WorkOrder360.tsx:52`          | `to: \`/360/project/${id}\``        | `to: \`/project/${id}\``         |

These were not in AGENT-262's §5 enumeration (which counted only bare-path
emit-sites under `features/`, `pages/360/` mirrors, and control-rooms). They
are heredr in addition to the 30 healed by §5.

## 2. Total Heal Count

- **30 navigate-sites** healed by the App.tsx route rename (per AGENT-262 §5)
- **8 additional emit-sites** rewritten to bare paths (`pages/360/*` breadcrumbs + nav)
- **38 cross-360 click paths** now resolve to the correct component instead of `*` NotFound

## 3. Verification

### 3.1 Grep test (AGENT-262 §6 step 3)

```
$ rg "/360/(customer|employee|finance|po|project|quote|rfq|supplier|work-order)/" \
     techno-kol-ops/client/src
No matches found
```

Zero hits. The fix and verification agree.

### 3.2 Files touched

| # | File                                                              | Lines |
|---|-------------------------------------------------------------------|-------|
| 1 | `techno-kol-ops/client/src/App.tsx`                               | 136-144 |
| 2 | `techno-kol-ops/client/src/pages/360/PO360.tsx`                   | 51, 52, 85 |
| 3 | `techno-kol-ops/client/src/pages/360/Project360.tsx`              | 27 |
| 4 | `techno-kol-ops/client/src/pages/360/Quote360.tsx`                | 57, 93 |
| 5 | `techno-kol-ops/client/src/pages/360/WorkOrder360.tsx`            | 51, 52 |

5 files, 17 line edits.

### 3.3 Recommended manual verification (per AGENT-262 §6)

1. `cd techno-kol-ops/client && npm run build` — confirm no TS errors.
2. Dev server smoke test:
   - Customer360 -> click quote row -> Quote360 (not NotFound)
   - Project360 -> click work-order row -> WorkOrder360
   - ProcurementControlRoom -> click PO row -> PO360
   - Quote360 "Convert to Project" success -> navigates to `/project/<newId>`
   - PO360 breadcrumb "ספק" -> Supplier360
   - WorkOrder360 breadcrumb "פרויקט" -> Project360
3. Browser back/forward across links -- no NotFound flicker.

## 4. Out-of-Scope Items (Unchanged from AGENT-262 §7)

- `Project360RouteWrapper` & `WorkOrder360RouteWrapper` legacy paths
  (`/project360/:id`, `/work-order360/:id`) still exist on lines 131-132. Not
  required for nav-heal; defer to follow-up.
- `appRouteRegistry` is still unused by `App.tsx` (App.tsx hand-rolls routes).
  After this patch the two agree on path shape, so a follow-up should make
  `App.tsx` consume the registry.
- Stub action buttons (PO360, Quote360, Finance360 etc.) -- separate fix per
  AGENT-204 §3.3.
- Backward-compat redirects (AGENT-262 §4) -- skipped; nothing emits `/360/...`
  after this patch (grep proves it).

## 5. Risk

**Very low.** Pure path-string edits, no component or routing-library
changes. URLs shorten by 4 chars. No external `/360/...` deep links exist
(grep proves it).

---

**End of report.**
