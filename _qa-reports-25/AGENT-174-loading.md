# AGENT-174 — Loading States Audit

**Scope:** Audit `skeletons vs spinners`, `Suspense` usage, optimistic updates, and stale-while-revalidate patterns across the 4 services (techno-kol-ops, onyx-procurement, payroll-autonomous, onyx-ai) plus erp-app, mobile-app, and AI-Task-Manager artifacts.
**Date:** 2026-04-29

---

## 1. Summary scoreboard

| Pattern | Implemented? | Coverage | Quality |
|---|---|---|---|
| Skeletons (animate-pulse) | YES | 387 occurrences across 70 files | Strong |
| Spinners (animate-spin) | YES | 785 occurrences across 4 files (mostly in erp-app/App.tsx) | OK but heavy |
| `<Suspense>` route boundaries | YES | erp-app, payroll-autonomous, techno-kol-ops/client | Good |
| `React.lazy` lazy pages | YES | 387 occurrences, 70 files | Excellent |
| Optimistic updates (`onMutate`+rollback) | NO | Not found anywhere | **Gap** |
| `placeholderData: (prev) => prev` (SWR-style) | PARTIAL | Only `AI-Task-Manager/artifacts/erp-app/src/pages/dashboard.tsx` (8x) and `crm-ultimate-dashboard.tsx` | **Gap** |
| `refetchInterval` (live polling) | YES | 5 control-room files in payroll-autonomous, plus chat-page | OK |
| `staleTime` configured | PARTIAL | Only chat-page and the dashboards above | **Gap** |
| Service-worker stale-while-revalidate | YES | `payroll-autonomous/public/sw.js` (images) | Good |

---

## 2. Skeleton infrastructure (the good)

The codebase has a well-designed unified skeleton system in `erp-app/src/components/ui/`:

- **`skeleton.tsx`** — base `<Skeleton>` primitive (`animate-pulse rounded-md bg-primary/10`).
- **`skeleton-card.tsx`** — composed `SkeletonCard`, `SkeletonTable`, `SkeletonKPI`, `SkeletonPage` with framer-motion fade-in.
- **`unified-states.tsx`** — `LoadingSkeleton` with 6 variants (`table | cards | form | dashboard | list | page`), plus `EmptyState`, `ErrorBoundary`, `InlineError`, `QueryError`, and the `withPage()` HOC that wraps lazy pages with `<PageBoundary><Suspense fallback={<PageSkeleton/>}>...`.

This is the **right pattern** — page-shaped skeletons that mirror the final layout, not generic spinners.

`erp-app/src/routes/lazy-utils.tsx` wires `lazyPage()` with retry-on-import-failure and the `withPage()` HOC. This is the production-grade lazy boundary.

---

## 3. Suspense + lazy routes

| App | Lazy + Suspense wiring | File |
|---|---|---|
| erp-app | `lazyPage()` + `withPage()` per route, retries chunk failures | `src/routes/lazy-utils.tsx` |
| techno-kol-ops/client | Per-route `<Suspense fallback={<RouteFallback/>}>` from registry | `src/router/index.tsx:30` |
| payroll-autonomous | `lazy()` + top-level Suspense in `App.jsx` (33 lazy components, line 32+) | `src/App.jsx` |
| AI-Task-Manager artifacts | Same `withPage` pattern mirrored | `artifacts/erp-app/src/components/ui/unified-states.tsx` |
| mobile-app | Native `LoadingSpinner` with `ActivityIndicator` (no Suspense) | `src/components/LoadingSpinner.tsx` |

**Issue:** `techno-kol-ops/client/src/router/index.tsx:8-12` uses a plain `"טוען עמוד..."` text with `animate-pulse` instead of a layout-shaped skeleton. This is inferior to the `PageSkeleton` used by erp-app.

---

## 4. Spinners vs skeletons

- **erp-app/src/App.tsx** alone has 782 `animate-spin` occurrences — these are inline action spinners (`<LoadingOverlay>`, `<ActionButton loading>`), which is appropriate.
- **mobile-app** uses native `ActivityIndicator` only (RN). No skeletons. Acceptable for native, but the in-list refresh state should be a row-shaped skeleton, not a fullscreen spinner.
- **`useApi` hook** (`techno-kol-ops/client/src/hooks/useApi.ts:22-66`) only exposes `loading: boolean` — callers default to spinner behavior. There is no skeleton hint based on first-load vs refetch.

**Recommendation:** Standardize "first paint = skeleton, mutation/refetch = spinner overlay or button-spinner." This is what `LoadingOverlay` in `use-api-action.tsx:185` does — extend it.

---

## 5. Optimistic updates — **MAJOR GAP**

A repo-wide search for `onMutate`, `setQueryData`, `invalidateQueries` returned **zero matches** in production code paths (only in mobile-app/app screens for invalidation). The pattern of:

```ts
useMutation({ onMutate, onError: rollback, onSettled: invalidate })
```

is **not used anywhere** in the 4 services. All mutations use `useApiAction` (AI-Task-Manager/artifacts/erp-app/src/hooks/use-api-action.tsx) which:
1. Sets `loading=true`
2. Awaits fetch
3. Toasts success/error
4. Calls `onSuccess` callback (caller must refetch manually)

**Impact:** Every state change (status transition, approval click, save) waits for round-trip before UI reflects. For a Palantir-grade ERP this is a noticeable friction on the 91 state-machine transitions and 18 orchestrator actions.

**Recommended fix:** Migrate critical state-transition actions (approve quote, post invoice, advance work order) to `useMutation` with `onMutate` patching the React Query cache, and `onError` rolling back.

---

## 6. Stale-while-revalidate — **PARTIAL**

### What exists
- **Service worker** `payroll-autonomous/public/sw.js:156,224` — proper SWR strategy for image caching.
- **`placeholderData: (prev) => prev`** — used 8x in `AI-Task-Manager/artifacts/erp-app/src/pages/dashboard.tsx` and once in `crm-ultimate-dashboard.tsx`. This is the React Query equivalent of `keepPreviousData`, giving instant repaint with previous data while refetching.
- **`refetchInterval`** — 5 dashboards/control rooms poll on schedules (KPIEngine 30s, ExecutiveControlTower 60s, DashboardWidgetsBoard 60s, CommandCenter 20s, GPS share 10s).

### What's missing
- No global `staleTime` config on the QueryClient. Every component refetches on mount. Search for `new QueryClient(` only finds default-options instantiations.
- Dashboards in the **production** `erp-app/src/pages/` (not the AI-Task-Manager artifacts) do not consistently use `placeholderData`. The pattern lives only in artifacts.
- No `prefetchQuery` calls in router preload — navigation always shows skeleton even for cached data.

---

## 7. Specific issues found

| # | Severity | File | Issue |
|---|---|---|---|
| 1 | High | `techno-kol-ops/client/src/hooks/useApi.ts:22-66` | Boolean `loading` only — no first-load vs refetch differentiation; callers can't easily render skeletons. No request deduplication, no caching. |
| 2 | High | All 4 services | No `useMutation` + `onMutate` optimistic pattern anywhere. State transitions feel slow. |
| 3 | Medium | `techno-kol-ops/client/src/router/index.tsx:8-12` | `RouteFallback` is a single text line, not a layout skeleton. Hurts perceived perf. |
| 4 | Medium | `payroll-autonomous/src/features/controlRooms/KPIEngine.tsx:35` | `if (query.isLoading) return <div>Loading KPI Engine...</div>` — text loader, not the `SkeletonKPI` already available. |
| 5 | Medium | erp-app QueryClient | No global `staleTime` / `gcTime` config — every nav refetches. |
| 6 | Low | `mobile-app/src/components/LoadingSpinner.tsx` | Only spinner pattern, no list/row skeleton variant. |
| 7 | Low | `placeholderData: (prev) => prev` only in artifacts dir | Pattern not promoted to production `erp-app/src/pages/`. |

---

## 8. Recommended actions

1. **P0** — Add a project-wide `useOptimisticMutation` wrapper around `useMutation` with `onMutate`/`onError` rollback for the 18 orchestrator actions and 91 state transitions. Wire into `useApi`.
2. **P0** — Replace `KPIEngine`'s text loader with `<SkeletonKPI count={6} />`. Audit other "Loading..." text returns.
3. **P1** — In `techno-kol-ops/client/src/router/index.tsx`, swap `RouteFallback` for the `PageSkeleton` from `unified-states.tsx`.
4. **P1** — Set `QueryClient` defaults: `staleTime: 30_000`, `gcTime: 5*60_000`, `refetchOnWindowFocus: false` for read-mostly queries.
5. **P1** — Add `placeholderData: (prev) => prev` to all paginated tables / filtered queries in the 9 Master 360 pages.
6. **P2** — Promote service-worker SWR pattern from payroll-autonomous to all 4 services for static API responses (entity-map, wiring-spec, pipeline-stages — these change rarely).
7. **P2** — Add `prefetchQuery` on hover for primary action buttons (e.g. "Open Project360") in master lists.

---

## 9. Files referenced (absolute paths)

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\components\ui\unified-states.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\components\ui\skeleton.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\components\ui\skeleton-card.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\routes\lazy-utils.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\client\src\router\index.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\client\src\hooks\useApi.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\AI-Task-Manager\artifacts\erp-app\src\hooks\use-api-action.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\payroll-autonomous\src\App.jsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\payroll-autonomous\src\features\controlRooms\KPIEngine.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\payroll-autonomous\public\sw.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\AI-Task-Manager\artifacts\erp-app\src\pages\dashboard.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\mobile-app\src\components\LoadingSpinner.tsx`

---

**Verdict:** Skeleton primitives and Suspense/lazy wiring are **excellent**. Optimistic updates are **completely absent** — biggest gap. Stale-while-revalidate exists in pockets (sw.js + AI-Task-Manager artifact dashboards) but is not standardized.
