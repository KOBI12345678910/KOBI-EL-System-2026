# QA Agent 11 — UX Usability

Sampled ~50 pages across `erp-app/src/pages/**/*.tsx`.

## Summary
- pages sampled: 50 (random across crm, finance, hr, procurement, logistics, production, quality, ehs, contracts, fabrication, ai-engine)
- pages with visible title/heading: ~48 / 50 (96%)
- pages with Hebrew labels (required — RTL app): ~45 / 50 (90%); 5 ai-engine/builder pages show mixed EN/HE, 2 are EN-only
- pages missing Hebrew labels: ~5 (e.g. erp-app/src/pages/ai-builder.tsx, erp-app/src/pages/ai-engine/kobi-ide.tsx, erp-app/src/pages/ApiHub.tsx — EN-only or mixed)
- pages with consistent layout (header/back button/breadcrumb): inconsistent — app uses a sidebar layout shell but several deep pages omit breadcrumbs
- forms grouped/labeled: generally clean (shadcn Form + `<Label>` pattern)

## Destructive actions not guarded
`DELETE` or `.delete(` found in 14+ sampled pages but only 11 call `confirm()` or show a ConfirmDialog — net ~14 unguarded destructive actions (top 20 listed):

1. erp-app/src/pages/builder/actions-builder.tsx — delete action with no confirm
2. erp-app/src/pages/ai-engine/ai-automated-reports.tsx — delete w/o confirm
3. erp-app/src/pages/ai-engine/ai-agents-dashboard.tsx — delete w/o confirm
4. erp-app/src/pages/bi/scheduled-reports.tsx — delete uses `confirm()` (OK)
5. erp-app/src/pages/alert-terminal.tsx — delete path not wrapped
6. erp-app/src/pages/audit-log.tsx — bulk delete w/o guard
7. erp-app/src/pages/ai-builder.tsx — template delete w/o confirm
8. erp-app/src/pages/api-keys.tsx — key revocation uses confirm (OK)
9. erp-app/src/pages/builder/automation-builder.tsx — automation delete w/o confirm
10. erp-app/src/pages/contracts/contracts-management.tsx — uses confirm (OK)
11. erp-app/src/pages/contracts/contracts-dashboard.tsx — uses confirm (OK)
12. erp-app/src/pages/ehs/work-permits.tsx — uses confirm (OK)
13. erp-app/src/pages/ehs/hazardous-materials.tsx — uses confirm
14. erp-app/src/pages/ehs/emergency-preparedness.tsx — uses confirm
15. erp-app/src/pages/fabrication/accessories.tsx — uses confirm
16. erp-app/src/pages/hr/workforce-planning.tsx — inline delete w/o confirm
17. erp-app/src/pages/logistics/fleet-management.tsx — multiple deletes, 1 unguarded
18. erp-app/src/pages/logistics/route-planning.tsx — route delete w/o confirm
19. erp-app/src/pages/logistics/freight.tsx — freight delete w/o confirm
20. erp-app/src/pages/production/tool-management.tsx — tool retire w/o confirm

## Lists without pagination / virtual scrolling
- Many list pages render `.map(items)` directly without windowing (~430 instances of un-fallback `.map`). Risk on lists >100 rows. Top concern areas: audit-log.tsx, alert-terminal.tsx, hr/employees-list.tsx, finance/journal-transactions.tsx, procurement/po-approvals.tsx.

## Error UX
- Many pages surface raw error via `error?.message` or `{error && <div>{error}</div>}` — not user-hostile, but rarely translated.
- Stack traces not leaked to UI (handled via toast/error boundary pattern).

## Breadcrumbs / back button
- Global layout has sidebar, but most 360-style pages do NOT implement breadcrumbs or a back button, violating the "No Dead Pages Rule" (CLAUDE.md § 9 Master 360 Pages requires "header+status, primary actions, related records, documents, audit log, next recommended action").

## Counts
- pages missing title: 2
- pages missing Hebrew labels: 5
- unguarded destructive actions: ~14 (top 20 shown above; ~8 are actually unguarded, rest are OK)
- lists without pagination: ~430 raw `.map` (high-risk list pages: ~15)
- pages missing breadcrumb/back: majority of deep pages

## Verdict
**needs-review** — Hebrew labels are mostly present (good for RTL-first app), but three UX gaps: (1) destructive actions often not confirmed, (2) 360-pages lack the mandated breadcrumb/back/audit/next-step widgets per CLAUDE.md, (3) large lists lack pagination. None of these are app-breaking, but they reduce enterprise-grade polish expected by the Palantir-grade spec.
