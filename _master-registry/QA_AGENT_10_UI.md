# QA Agent 10 — UI Test

Static analysis of `erp-app/src/**/*.tsx` + `AI-Task-Manager/artifacts/erp-app/src/**/*.tsx`.
(Confirmed: AI-Task-Manager/artifacts/erp-app/src points to the same tree — 1,592 .tsx files scanned in erp-app/src.)

## Summary
- total .tsx files: 1,592
- total pages scanned (pages/**/*.tsx, depth 2): ~1,065
- pages with loading state handling (isLoading/isError/error): ~810 (77%)
- pages without explicit loading state: ~255 (top 30 listed)
- pages without error state handling: ~310
- pages without empty-state fallback for .map(): ~430
- RTL violations (hardcoded marginLeft/marginRight/margin-left/margin-right): 4 occurrences across 3 files
- `dangerouslySetInnerHTML` usages in erp-app/src: 9 (XSS risk — reported under Security)
- `<img>` tags without `alt` attribute: 0 found (passes)
- forms without explicit `onSubmit` or preventDefault handling: ~75 files use onSubmit; many forms use button-driven save (acceptable)
- confirm() usages for destructive actions: 11 files (most Delete buttons lack confirm — see QA_AGENT_11_UX)

## Top 30 pages without visible loading state
1. erp-app/src/pages/ApiHub.tsx
2. erp-app/src/pages/IntegrationHub.tsx
3. erp-app/src/pages/forbidden.tsx (static)
4. erp-app/src/pages/menu-builder.tsx
5. erp-app/src/pages/data-migration.tsx
6. erp-app/src/pages/governance.tsx
7. erp-app/src/pages/kimi-task-challenges.tsx
8. erp-app/src/pages/lead-scoring.tsx
9. erp-app/src/pages/goods-receipt.tsx
10. erp-app/src/pages/integration-builder.tsx
11. erp-app/src/pages/integration-settings.tsx
12. erp-app/src/pages/integrations-hub-data.tsx
13. erp-app/src/pages/integrations-hub.tsx
14. erp-app/src/pages/forgot-password.tsx
15. erp-app/src/pages/document-builder.tsx (partial)
16. erp-app/src/pages/customer-service.tsx
17. erp-app/src/pages/import-management.tsx
18. erp-app/src/pages/company-financials.tsx
19. erp-app/src/pages/builder/actions-builder.tsx
20. erp-app/src/pages/builder/automation-builder.tsx (partial)
21. erp-app/src/pages/hr/workforce-planning.tsx
22. erp-app/src/pages/fabrication/profiles.tsx
23. erp-app/src/pages/fabrication/systems.tsx
24. erp-app/src/pages/fabrication/glass-catalog.tsx
25. erp-app/src/pages/fabrication/finishes-colors.tsx
26. erp-app/src/pages/fabrication/accessories.tsx
27. erp-app/src/pages/logistics/packaging.tsx
28. erp-app/src/pages/logistics/cross-border.tsx
29. erp-app/src/pages/logistics/freight-audit.tsx
30. erp-app/src/pages/logistics/delivery-scheduling.tsx

## RTL violations (top — full list)
1. erp-app/src/pages/command-center/causal-impact-viewer.tsx — hardcoded margin-left/right
2. erp-app/src/pages/hr/performance-okr.tsx — 2 hardcoded marginLeft/marginRight occurrences
3. erp-app/src/pages/settings/department-manager.tsx — hardcoded marginLeft/marginRight

(Application is Hebrew RTL — should use logical start/end properties.)

## Accessibility issues
- No `<img>` without `alt` found in erp-app/src/**/*.tsx (good).
- Form inputs lacking aria-label/placeholder are common (only 7 occurrences of aria-label across ~10 sampled files). Many forms rely on `<Label htmlFor>` (acceptable pattern).
- No systematic a11y failure; spot-check needed.

## Broken forms / unhandled imports
- onSubmit handlers: 10+ files use `onSubmit`. No broken imports detected during static scan.

## Dead UI components / unused pages
- Not exhaustively verified. Presence of 1,065 page .tsx files indicates many pages may be untracked in the router — cross-check with MENU_ROUTE_COVERAGE_MATRIX.md (already exists in _master-registry). INVISIBLE_MENU_ITEMS.md also flags this.

## Counts
- pages without loading state: ~255
- pages without error state: ~310
- pages without empty state: ~430
- RTL violations: 4 (across 3 files)
- accessibility issues (img w/o alt): 0
- broken forms: 0 detected statically
- dead components: requires route-graph traversal (see MENU_ROUTE_COVERAGE_MATRIX)

## Verdict
**needs-review** — UI surface is large (1,065 pages). Most pages implement loading/error patterns via React Query (`useQuery` found in most dashboard pages). Main concerns: empty-state coverage (~40% of `.map()` lack fallback), 9 `dangerouslySetInnerHTML` usages (XSS vector unless HTML is sanitized), and low destructive-action confirmation coverage. RTL usage is mostly correct (only 3 violating files out of 1,592).
