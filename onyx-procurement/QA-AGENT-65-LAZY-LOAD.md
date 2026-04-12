# QA AGENT #65 — Lazy Loading Audit (onyx-procurement)

**Target:** `onyx-procurement/web/onyx-dashboard.jsx` (710 lines)
**Date:** 2026-04-11
**Mode:** Static analysis only
**Dimension:** Lazy Loading / Initial Load Optimization

---

## 1. Initial Load — How Much Loads Upfront?

**Finding: Massive eager load. Zero lazy loading at any level.**

### 1.1 Imports (line 1)
```jsx
import { useState, useEffect, useCallback } from "react";
```
- No `React.lazy()`, no `Suspense`, no dynamic `import()`.
- All 7 tab components (`DashboardTab`, `SuppliersTab`, `RFQTab`, `QuotesTab`, `OrdersTab`, `SubcontractorsTab`, `SubDecideTab`) + helpers (`KPI`, `Input`, `Select`, `MiniStat`) are defined in the **same file** and shipped in a single JS chunk.
- Google Font `Rubik` weights 400-900 loaded via `@import` at runtime (line 101) — blocking render.

### 1.2 Initial Data Fetch — `refresh()` (lines 34-43)
On **every** mount the component fires **6 parallel API calls**, regardless of which tab the user opens:
```jsx
const [s, sup, sub, o, r, sav] = await Promise.all([
  api("/api/status"),
  api("/api/suppliers"),
  api("/api/subcontractors"),
  api("/api/purchase-orders"),
  api("/api/rfqs"),
  api("/api/analytics/savings"),
]);
```
- A user opening just the "dashboard" tab pays for **all 7 tabs** worth of data.
- Then repeats every 30 seconds via `setInterval(refresh, 30000)` (line 45) — even if the tab is in the background.
- No pagination on `/api/suppliers`, `/api/purchase-orders`, `/api/rfqs` — entire tables are downloaded.

**Severity: HIGH.** First contentful paint is held hostage by the slowest of 6 endpoints.

---

## 2. Tab Content Lazy?

**Finding: NOT LAZY. Conditional render only.**

Lines 91-97:
```jsx
{tab === "dashboard" && <DashboardTab ... />}
{tab === "suppliers" && <SuppliersTab ... />}
{tab === "rfq" && <RFQTab ... />}
{tab === "quotes" && <QuotesTab ... />}
{tab === "orders" && <OrdersTab ... />}
{tab === "subcontractors" && <SubcontractorsTab ... />}
{tab === "sub_decide" && <SubDecideTab ... />}
```

- This is **conditional rendering**, not lazy loading. All 7 tab components are:
  - Parsed at page load
  - Compiled into the bundle
  - Present in memory even when not displayed
- No `React.lazy(() => import('./SuppliersTab'))` pattern.
- No code splitting — single bundle for everything.
- Switching tabs re-mounts the component (no memoization of prior state) — forms reset on tab change.

**Severity: HIGH** for a dashboard with 7 heavy tabs.

---

## 3. Long Supplier List Virtualization (react-window)?

**Finding: NO VIRTUALIZATION. Full `.map()` rendering.**

### 3.1 Suppliers (lines 216-234)
```jsx
{suppliers.map(s => (
  <div key={s.id} style={styles.supplierCard}>
    ... 4 MiniStats per card ...
  </div>
))}
```
No `react-window`, `react-virtualized`, `react-virtuoso`, or `IntersectionObserver`.

### 3.2 Other Unbounded Lists
| Line | List | Components per row | Virtualized? |
|------|------|---------------------|--------------|
| 216  | `suppliers.map` | ~6 divs + 4 MiniStats | NO |
| 457  | `orders.map` (OrdersTab) | badge + `o.po_line_items.map` nested | NO |
| 471  | `o.po_line_items.map` (nested inside each order) | 1 div | NO |
| 495  | `subcontractors.map` | card + `subcontractor_pricing.map` nested | NO |
| 507  | `subcontractor_pricing.map` (nested) | 1 div | NO |
| 383  | `rfqDetail.quotes.map` | 1 listItem | NO |
| 422  | `quoteForm.line_items.map` | 4 Inputs | NO |
| 578  | `result.candidates.map` | 1 listItem | NO |

A supplier list of 1,000 rows = 1,000 cards × ~5 DOM nodes each ≈ **5,000+ DOM nodes** rendered at once.

**Severity: HIGH** once the dataset exceeds ~100 suppliers.

### 3.3 Partial exception
Line 151: `orders.slice(0, 5).map(o => ...)` in the dashboard preview — caps at 5 orders, which is fine. But the full OrdersTab (line 457) renders everything.

---

## 4. Image Lazy Loading (`loading="lazy"`)

**Finding: No `<img>` tags anywhere. N/A but relevant.**

- The entire UI uses emoji icons (lines 48-55) as text: `📊 🏭 📤 📥 📦 👷 🎯`.
- No supplier logos, no product photos, no user avatars.
- No `<img loading="lazy">`, no `<picture>`, no `srcSet`.
- Logo is a CSS gradient div with text "O" (line 65).

**Severity: LOW** (no images present). However, the dashboard is **missing** visual richness typical of procurement systems — supplier logos, product thumbnails, PO attachments. When these are added, lazy loading will be mandatory.

---

## 5. Below-the-Fold Content

**Finding: Everything renders immediately, no deferment.**

- `DashboardTab` (lines 119-166): KPI grid + savings card + recent orders — all in one sync render. No `IntersectionObserver`, no `content-visibility: auto`, no scroll-triggered rendering.
- Long supplier/order lists render entirely even though 90% of cards are below the viewport on first paint.
- No "load more" pagination button, no infinite scroll.
- No `defer`/`async` for the Google Fonts import (line 101) — it's a `@import` inside injected `<style>` which is the slowest possible path.

**Severity: MEDIUM-HIGH.**

---

## 6. Skeleton Screens During Load

**Finding: NO skeletons. Single text loader.**

Line 89:
```jsx
{loading && <div style={styles.loading}>טוען...</div>}
```

- Only a centered text "טוען..." (Hebrew: "Loading...").
- No `<Skeleton>` components, no shimmer placeholders, no layout-stable loaders.
- Layout shift (CLS) occurs: header + nav render, then the "טוען..." block takes main area, then disappears and actual content pushes in.
- The loader shows on every 30-second polling cycle too (line 45), causing flicker every half-minute.
- No per-card loading state; when navigating tabs with stale data the user sees empty state until `refresh()` completes.

**Severity: MEDIUM.** Fixable cheaply.

---

## 7. Recommendation

### 7.1 Critical (do first)
1. **Code-split by tab** — convert each tab to `React.lazy` + `Suspense`:
   ```jsx
   const SuppliersTab = React.lazy(() => import('./tabs/SuppliersTab'));
   // ...
   <Suspense fallback={<TabSkeleton />}>
     {tab === "suppliers" && <SuppliersTab ... />}
   </Suspense>
   ```
   Split `onyx-dashboard.jsx` (710 lines, 1 file) into 8 files: 1 shell + 7 tab modules + `ui/` (Input/Select/MiniStat).
   Expected initial-bundle reduction: ~60-70%.

2. **Load data per tab, not upfront.** Remove the 6-in-parallel `refresh()` on mount. Each tab fetches only what it needs on first activation:
   ```jsx
   useEffect(() => { if (tab === "suppliers") fetchSuppliers(); }, [tab]);
   ```
   Keep `/api/status` as the only global call.

3. **Virtualize long lists** — install `react-window`:
   ```jsx
   import { FixedSizeList } from 'react-window';
   <FixedSizeList height={600} itemCount={suppliers.length} itemSize={140}>
     {({ index, style }) => <SupplierCard style={style} s={suppliers[index]} />}
   </FixedSizeList>
   ```
   Apply to `SuppliersTab` (line 216), `OrdersTab` (line 457), `SubcontractorsTab` (line 495).

### 7.2 High priority
4. **Skeleton screens.** Replace line 89 "טוען..." text with dedicated skeleton components matching the real layout (KPI skeleton, card skeleton, table skeleton) to eliminate CLS.
5. **Smart polling.** Replace blind `setInterval(refresh, 30000)` (line 45) with `document.visibilityState === "visible"` check + tab-scoped refresh:
   ```jsx
   useEffect(() => {
     if (document.hidden) return;
     const i = setInterval(refreshCurrentTab, 30000);
     return () => clearInterval(i);
   }, [tab]);
   ```
6. **Pagination / cursor** on `/api/suppliers`, `/api/purchase-orders`, `/api/rfqs`. Load 50 at a time.

### 7.3 Medium priority
7. **Preload Google Fonts** via `<link rel="preload">` in `index.html` instead of runtime `@import` (line 101) — self-host Rubik to eliminate the third-party blocking request.
8. **Memoize tab components** with `React.memo` + stable prop references (e.g. `useMemo` the `suppliers` list) so switching tabs doesn't trigger re-renders of siblings.
9. **Debounce form updates** inside `RFQTab` / `QuotesTab` — each `updateItem` (line 251, 424) spreads the whole array on every keystroke.

### 7.4 Low priority / future-proofing
10. Add `content-visibility: auto` on card containers (`styles.card`, `styles.supplierCard`) as a zero-cost below-the-fold optimization.
11. When supplier logos / product images are introduced, mandate `<img loading="lazy" decoding="async">` + `srcSet`.
12. Consider `React.startTransition` for tab switches to keep the UI responsive during heavy re-renders.

---

## Lazy Loading Score

| Dimension | Score | Notes |
|---|---|---|
| Code splitting | 0 / 10 | Monolithic file, no `React.lazy` |
| Data fetching | 1 / 10 | 6 parallel calls up-front for all tabs |
| List virtualization | 0 / 10 | Full `.map()` on unbounded arrays |
| Image lazy loading | N/A | No images present |
| Below-the-fold defer | 0 / 10 | Everything renders eagerly |
| Skeleton screens | 1 / 10 | Single text loader only |
| **Overall** | **~3 / 60** | **Critical work needed** |

---

## Files referenced
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\web\onyx-dashboard.jsx` (lines 1-710)
