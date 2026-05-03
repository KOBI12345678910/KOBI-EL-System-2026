# AGENT-265 — Mock Data Fallback Audit (FRONTEND #5)

Date: 2026-04-29
Scope: hardcoded mock data fallbacks (`FALLBACK_*`, `MOCK_*`, demo arrays) in client apps.

## Executive summary

Total fallback constants located across active client apps:

| Client app | Files affected | `FALLBACK_*` / `MOCK_*` declarations |
|---|---|---|
| `erp-app/` (Vite/React TS — main UI) | 361 | 1,458 |
| `mobile-app/` (React Native) | 8 | 8 |
| `lib-client/` | 0 | 0 |
| `desktop-tutorial-client/` | 0 | 0 |
| `enterprise_palantir_core/` | 0 | 0 |
| `AI-Task-Manager/artifacts/erp-app/` (snapshot copy — non-shipping) | 250 | 1,034 |

The duplicate set in `AI-Task-Manager/artifacts/` mirrors `erp-app/` and is treated as derived; recommendations apply to the live tree.

Three architectural anti-patterns are present:

1. **Fallback-on-error** (acceptable): `useQuery` calls API, falls back only when response is non-OK or throws. Used by hooks (`useRealtime.ts`, `useDataPlatform.ts`, `useDataFabric.ts`) and the `advanced/*` pages.
2. **Mock-always** (severe): page issues a single `useQuery`, but only ONE state slice is taken from the response — every other slice is hardcoded `FALLBACK_*` regardless of API success. Example: `service-dashboard.tsx` reads `kpis` from API but `agents`, `slaCategories`, `ticketDistribution`, `tickets` are always `FALLBACK_*`.
3. **No-API** (critical): page declares mock arrays and never calls the API at all. Example: `tools-dies.tsx` queries `/api/assets/tools_dies` but `consumptionData`, `maintenanceSchedule`, `orderNeeded` are unconditionally hardcoded.

The dominant pattern (~80% of pages) is anti-pattern #2.

---

## Top fallback hotspots (≥10 declarations per file)

| File | Decls | Severity | Replacement endpoint(s) |
|---|---|---|---|
| `erp-app/src/pages/import/import-settings.tsx` | 12 | mock-always | `GET /api/import/settings` (tabs, currencies, hs_codes, rules) |
| `erp-app/src/pages/projects/project-360.tsx` | 12 | mock-always | `GET /api/projects/:id/360` (project, kpis, stages, team, events, finance, tasks, risks) |
| `erp-app/src/pages/documents/module-documents.tsx` | 11 | mock-always | `GET /api/documents/module-documents?module=X` |
| `erp-app/src/pages/integrations/integration-dashboard.tsx` | 11 | mock-always | `GET /api/integrations/dashboard` (already has `/api/integrations` — extend) |
| `erp-app/src/pages/hr/hr-analytics.tsx` | 11 | mock-always | `GET /api/hr/analytics` (kpis, turnover, attendance, payroll-bands) |
| `erp-app/src/pages/import/import-analytics.tsx` | 10 | mock-always | `GET /api/import/analytics` |
| `erp-app/src/pages/engineering/engineering-analytics.tsx` | 10 | mock-always | `GET /api/engineering/analytics` |
| `erp-app/src/pages/supply-chain/supply-chain-command-center.tsx` | 10 | mock-always | `GET /api/supply-chain/command-center` |
| `erp-app/src/pages/platform/master-data.tsx` | 10 | mock-always | `GET /api/platform/master-data` |
| `erp-app/src/pages/supply-chain/supply-chain-analytics.tsx` | 16 | mock-always | `GET /api/supply-chain/analytics` |
| `erp-app/src/pages/import/import-tracking.tsx` | 8 | mock-always | `GET /api/import/tracking` |
| `erp-app/src/pages/supply-chain/bom-command-center.tsx` | 8 | mock-always | `GET /api/bom/command-center` |
| `erp-app/src/pages/documents/dms-command-center.tsx` | 8 | mock-always | `GET /api/dms/command-center` |
| `erp-app/src/pages/integrations/integration-settings.tsx` | 8 | mock-always | `GET /api/integrations/settings` |
| `erp-app/src/pages/documents/document-analytics.tsx` | 9 | mock-always | `GET /api/documents/analytics` |
| `erp-app/src/pages/tenders/tender-analytics.tsx` | 9 | mock-always | `GET /api/tenders/analytics` |
| `erp-app/src/pages/crm/customer-360.tsx` | 9 | mock-always | `GET /api/crm/customers/:id/360` |
| `erp-app/src/pages/engineering/engineering-settings.tsx` | 9 | mock-always | `GET /api/engineering/settings` |

(Full per-file count list: 361 files in erp-app — see Appendix A summary.)

---

## Anti-pattern #1 — fallback-on-error (3 hooks + ~10 pages)

These are intentional resilience fallbacks. Acceptable IF the fallback represents *empty/zero state*, NOT fabricated business data.

### Findings

`erp-app/src/hooks/useRealtime.ts:146` `FALLBACK_SNAPSHOT: CompanySnapshot`
- Fabricates 21 module health scores (crm 92, sales 85, projects 55, etc.). Misleading when API is down — operators may act on fake "78% overall health".
- Replace with: `null` snapshot + UI loading/error state. API: `GET /api/realtime/snapshot` already exists.

`erp-app/src/hooks/useDataPlatform.ts:133` `FALLBACK_SNAPSHOT: PlatformSnapshot`
- Already correctly zero-valued (totals=0, breakdown={}). KEEP — but rename to `EMPTY_SNAPSHOT` for clarity. API: `GET /api/data-platform/snapshot`.

`erp-app/src/hooks/useDataFabric.ts:103` `FALLBACK_OVERVIEW`
- Already zero-valued. KEEP, rename. API: `GET /api/data-fabric/overview`.

### Replacement pattern

```ts
queryFn: async () => {
  const r = await authFetch(`${API}/snapshot`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
// Caller renders loading/error UI when isLoading || isError, never fabricated data.
```

---

## Anti-pattern #2 — mock-always (~290 files, 1,200+ declarations)

The `useQuery` exists, often hits a real endpoint, but the page assigns most of its slices to `FALLBACK_*` constants ignoring the response.

### Canonical example: `erp-app/src/pages/customer-service/service-dashboard.tsx:89-100`

```ts
const { data: servicedashboardData } = useQuery({
  queryKey: ["service-dashboard"],
  queryFn: () => authFetch("/api/customer-service/service_dashboard"),
});
const kpis = servicedashboardData ?? FALLBACK_KPIS;          // ← uses API
const agents = FALLBACK_AGENTS;                              // ← ignores API
const slaCategories = FALLBACK_SLA_CATEGORIES;               // ← ignores API
const ticketDistribution = FALLBACK_TICKET_DISTRIBUTION;     // ← ignores API
const tickets = FALLBACK_TICKETS;                            // ← ignores API
```

The `/api/customer-service/service_dashboard` endpoint must already (or be extended to) return `{kpis, agents, slaCategories, ticketDistribution, tickets}`. Page becomes:

```ts
const { data, isLoading, error } = useQuery({
  queryKey: ["service-dashboard"],
  queryFn: async () => {
    const r = await authFetch("/api/customer-service/service_dashboard");
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
});
if (isLoading) return <Skeleton />;
if (error) return <ErrorState onRetry={refetch} />;
const { kpis, agents, slaCategories, ticketDistribution, tickets } = data;
```

### Affected modules (representative, see Appendix A for full list)

- `customer-service/*` (4 files, 20 fallbacks): rma, complaints, warranty-management, service-dashboard
- `ai-engine/*` (16 files, 92 fallbacks): ai-customer-service, ai-customer-service-pro, ai-executive-insights, ai-lead-scoring-pro, ai-procurement-optimizer, ai-production-insights, ai-quotation-assistant, ai-sales-assistant, bash44-* (8 files)
- `tenders/*` (10 files, 47 fallbacks): tenders-command-center, tenders-management, bid-analysis, tender-{alerts,analytics,competitors,dashboard,documents,evaluation,pricing,submissions,timeline}
- `supply-chain/*` (15 files, 75 fallbacks): bom-* (7), supply-chain-{alerts,analytics,command-center,dashboard,settings,visibility}, demand-planning, lead-time-management, engineering-change-orders
- `engineering/*` (13 files, 73 fallbacks): drawing-management, design-reviews, engineering-{alerts,analytics,calculations,command-center,documents,office,projects,settings,standards}, material-specifications, prototype-testing, product-catalog
- `installation/*` (19 files, 95 fallbacks): customer-handover, equipment-tools, field-exceptions, installer-profiles, installation-{alerts,command-center,cost-tracking,documents,execution,management,orders,profitability,progress,quality-control,scheduling,settings,teams}, loading-dispatch, measurements-surveys, return-service-calls, site-readiness
- `logistics/*` (13 files, 41 fallbacks): barcode-rfid, customer-tracking-portal, delivery-cost-analysis, driver-management, fleet-{alerts,command-center,delivery,management}, fuel-management, loading-dock, reverse-logistics, shipment-tracking-live, vehicle-{maintenance,registry}
- `import/*` (14 files, 75 fallbacks): containers-packages, customs-clearance, foreign-suppliers, import-{analytics,approvals,dashboard,documents,purchase-orders,receiving,risk-alerts,settings,shipments,tracking}, landed-cost-calculator, shipping-forwarders
- `procurement/*` (24 files, ~80 fallbacks): blanket-orders, contracts-management, demand-planning, delivery-documents, documents-signatures, goods-receiving, inventory-sync, logistics-tracking, make-vs-buy, market-price-tracking, price-management, procurement-{alerts,analytics,automation,budgets,command-center,compliance,exceptions,profit-impact,settings,simulation}, purchase-orders, quality-control, raw-materials/{cost-analysis,raw-material-stock,raw-materials-{dashboard,list},scrap-waste,weight-calculator}, products/{product-bom,product-costing,products-{dashboard,list}}, subcontractor-management, supplier-{dependency,management,portal,returns}, vendor-negotiation
- `production/*` (19 files, 60 fallbacks): assembly-jobs, cut-jobs, finishing-jobs, labor-{control,time-tracking}, maintenance-downtime, master-production-schedule, material-issuance, production-{alerts,analytics,command-center,cost-tracking,exceptions,orders}, quality-defects-rework, shop-floor-control, shortages-page, smart-factory-dashboard, welding-jobs, work-{orders-list,stations}
- `pricing/*` (14 files, 47 fallbacks): actual-vs-estimated, labor-operations-cost, landed-cost-source, material-price-pull, pricing-{approvals,cost-builder,cost-calculator,dashboard,price-lists,requests-list,versions}, project-pricing-details, recommended-price, risk-margin-target, stock-vs-buy-decision, supplier-comparison-project
- `system/*` (8 files, 30 fallbacks): users-list, user-card, user-permission-override, user-role-assignment, roles-list, permissions-matrix, data-scope-management, approval-policy-management, access-audit-view
- `documents/*` (16 files, 89 fallbacks)
- `inventory/*` (9 files, 33 fallbacks)
- `finance/*` (6 files, 18 fallbacks)
- `hr/*` (8 files, 38 fallbacks)
- `crm/*` (15 files, 47 fallbacks): customer-360, predictive-forecasting, predictive-analytics, behavioral-analytics, communication-intelligence, decision-engine, agent-control-dashboard, pipeline-financial, realtime-feed, relationship-graph, security/{audit,encryption,row-security,sso}, integrations/rest-api
- `palantir/*` (9 files, 19 fallbacks)
- `integrations/*` (15 files, 71 fallbacks)
- `service/*` (8 files, 34 fallbacks)
- `fabrication/*` (15 files, 65 fallbacks)
- `assets/*` (4 files, 16 fallbacks)
- `operations/*` (7 files, 28 fallbacks)
- `knowledge/*` (5 files, 28 fallbacks)
- `quality/*` (2 files, 8 fallbacks)
- `safety/*` (2 files, 2 fallbacks)
- `sales/*` (2 files, 5 fallbacks)
- `reports/financial/*` (6 files, 25 fallbacks)
- `executive/*` (2 files, 11 fallbacks)
- `support/*` (2 files, 6 fallbacks)
- `platform/*` (3 files, 17 fallbacks)
- `product-dev/*` (3 files, 14 fallbacks)
- `contracts/*` (2 files, 2 fallbacks)
- `supplier-mgmt/*` (1 file, 1 fallback)
- `tenders/*` (covered above)

### Bulk replacement template

For each `pages/<module>/<page>.tsx`:

1. Map all `FALLBACK_X` constants in the file to keys `x` of a single response object.
2. Ensure backend returns the same shape from `GET /api/<module>/<page-snake>`.
3. Replace destructuring:

```ts
// BEFORE
const xData = useQuery(...);
const a = FALLBACK_A; const b = FALLBACK_B; const c = xData ?? FALLBACK_C;

// AFTER
const { data, isLoading, error, refetch } = useQuery({
  queryKey: ["<page>"],
  queryFn: async () => {
    const r = await authFetch("/api/<module>/<page-snake>");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  },
});
if (isLoading) return <PageSkeleton />;
if (error) return <ErrorBoundary onRetry={refetch} message={String(error)} />;
const { a, b, c } = data;
```

4. Delete `FALLBACK_*` constants from the file.

---

## Anti-pattern #3 — no-API (~50 files)

Files with `FALLBACK_*` declarations that are never compared against any API response. Example:

`erp-app/src/pages/assets/tools-dies.tsx:71-80`

```ts
const { data: toolsdiesData } = useQuery({
  queryKey: ["tools-dies"],
  queryFn: () => authFetch("/api/assets/tools_dies"),
});
const tools = toolsdiesData ?? FALLBACK_TOOLS;          // partial use
const consumptionData = FALLBACK_CONSUMPTION_DATA;       // never API
const maintenanceSchedule = FALLBACK_MAINTENANCE_SCHEDULE; // never API
const orderNeeded = FALLBACK_ORDER_NEEDED;               // never API
```

Listed examples (`FALLBACK_*` declared, never compared to API):

- `erp-app/src/pages/advanced/predictive-forecasting.tsx:36` `MOCK_FORECASTS` — endpoint exists (`/api/advanced/forecasting`) but response shape mismatch likely; align backend.
- `erp-app/src/pages/advanced/nl-query-assistant.tsx:26` `MOCK_HISTORY` — endpoint `/api/advanced/nl-query`.
- `erp-app/src/pages/advanced/graph-analytics.tsx:39,62` `MOCK_NODES`, `MOCK_EDGES` — endpoint `/api/advanced/graph-analytics`.
- `erp-app/src/pages/advanced/digital-twin-factory.tsx:43,58` `MOCK_MACHINES`, `MOCK_ALERTS` — endpoint `/api/advanced/digital-twin`.
- `erp-app/src/pages/advanced/anomaly-detection.tsx:59` `MOCK_ANOMALIES` — endpoint `/api/advanced/anomaly-detection`.
- `erp-app/src/pages/system/users-list.tsx:63` `FALLBACK_MOCK_USERS` (12 hardcoded users incl. real-looking names + emails + phones) — calls `/api/system/users_list` but assigns `MOCK_USERS = FALLBACK_MOCK_USERS` regardless of response content. Wire to API: shape `{users: SystemUser[], departments: string[], roles: string[]}`.
- `erp-app/src/pages/projects/project-360.tsx` 12 `FALLBACK_360_*` blocks all hardcoded; needs `GET /api/projects/:id/360` aggregator.

### Mobile app (8 files, all anti-pattern #3-style with `initialData`)

`mobile-app/src/screens/*.tsx`:

| File | Fallback | Endpoint replacement |
|---|---|---|
| `DashboardScreen.tsx:38` | `MOCK_SNAPSHOT` (5 projects + 3 alerts) | `api.getDashboardSnapshot()` — already wired, drop `initialData`, render skeleton + error |
| `ProjectsScreen.tsx` | `MOCK_*` projects | `api.getProjects()` |
| `WorkOrdersScreen.tsx` | `MOCK_*` work orders | `api.getWorkOrders()` |
| `WorkOrderDetailScreen.tsx` | `MOCK_*` detail | `api.getWorkOrder(id)` |
| `EmployeesScreen.tsx` | `MOCK_*` employees | `api.getEmployees()` |
| `MaterialsScreen.tsx` | `MOCK_*` materials | `api.getMaterials()` |
| `FinanceScreen.tsx` | `MOCK_*` finance | `api.getFinance()` |
| `AlertsScreen.tsx` | `MOCK_*` alerts | `api.getAlerts()` |

Replace `useQuery({ ..., initialData: MOCK_X })` with proper loading state — initialData hides whether the network succeeded.

---

## Concrete remediation plan (priority-ordered)

### P0 — Fabricated business data presented as real (high risk)

| File | Risk | Action |
|---|---|---|
| `erp-app/src/hooks/useRealtime.ts` | Operators may act on fake 78% health score | Replace fabricated `FALLBACK_SNAPSHOT` with `null`; add error boundary |
| `erp-app/src/pages/system/users-list.tsx` | Hardcoded users with fake emails/phones could be displayed | Wire to `/api/system/users_list`, delete `FALLBACK_MOCK_USERS` |
| `erp-app/src/pages/projects/project-360.tsx` | Hardcoded ₪4.85M contract, fake team members shown as real | Build `/api/projects/:id/360` aggregator |
| `erp-app/src/pages/crm/customer-360.tsx` | Same risk for customer pages | Build `/api/crm/customers/:id/360` aggregator |
| `erp-app/src/pages/finance/profitability-feedback-loop.tsx` (7 fallbacks) | Fabricated profitability numbers | Wire to `/api/finance/profitability` |
| `erp-app/src/pages/finance/payables-dashboard.tsx` (4 fallbacks) | Fabricated AP figures | Wire to `/api/finance/payables` |
| `erp-app/src/pages/finance/collections-dashboard.tsx` (4 fallbacks) | Fabricated AR figures | Wire to `/api/finance/collections` |
| `erp-app/src/pages/executive/executive-command-center.tsx` (5 fallbacks) | Exec dashboard with fake KPIs | Wire to `/api/executive/command-center` |
| `erp-app/src/pages/executive/bi-command-center.tsx` (6 fallbacks) | BI with fake aggregates | Wire to `/api/executive/bi` |

### P1 — Mock-always pattern across 360 pages, command centers, analytics

For every `*-360.tsx`, `*-command-center.tsx`, `*-analytics.tsx`, `*-dashboard.tsx`:

1. Author backend route `GET /api/<module>/<page>` returning the full data envelope.
2. Replace mock-always wiring with single-query destructure pattern (see template above).
3. Add `<PageSkeleton>` and `<ErrorState>` components if not present (`erp-app/src/components/ui/`).

Estimated effort: ~280 page files × 30 minutes = ~140 hours of mechanical work; can be parallelized across 8 agents in batches of 30–40 pages.

### P2 — Fallback-on-error hooks (resilience layer)

- Keep zero-state fallbacks in `useDataFabric.ts`, `useDataPlatform.ts`.
- Rename `FALLBACK_*` → `EMPTY_*` for clarity.
- Replace fabricated `FALLBACK_SNAPSHOT` in `useRealtime.ts` with empty state + clear loading/error UI.

### P3 — Cleanup

- Delete `AI-Task-Manager/artifacts/erp-app/` snapshot once primary tree is clean (1,034 stale fallbacks).
- Add ESLint custom rule `no-fallback-mock-data`: warn on `^const FALLBACK_` / `^const MOCK_` in `pages/*` and `screens/*` directories.
- Add CI check that fails build if `FALLBACK_*` count regresses above a fixed threshold.

---

## API endpoint coverage gap

Sampled `api-server/src/routes/` listing shows 50+ route files exist (e.g. `analytics-engine.ts`, `ai-engine-routes.ts`, `bom-product-engine.ts`, `bi-dashboards.ts`). Most module endpoints exist; gap is at the **page-aggregator** level — backend exposes per-entity routes but the UI mock-data shape needs aggregator endpoints (`GET /api/<module>/<page>`) returning the full payload-of-payloads each 360/command-center page wants.

Recommended backend pattern (one new file per page):

```
api-server/src/routes/<module>-page-aggregators.ts
  GET /api/customer-service/service_dashboard
    → { kpis, agents, slaCategories, ticketDistribution, tickets }
```

These aggregators compose existing per-entity queries; they are the missing link.

---

## Appendix A — full per-file fallback counts

Total: 361 erp-app files + 8 mobile-app files = 369 files, 1,466 fallback declarations on the live tree (excluding the 250-file `AI-Task-Manager/artifacts` mirror).

The complete per-file list was scanned with:
```
rg -n -c "^const (FALLBACK_|MOCK_|DEMO_)" erp-app/src mobile-app/src
```
Top buckets summarized in section "Anti-pattern #2 — affected modules" above. All 361 erp-app file paths and counts are stored in the prior tool scan (not re-listed here for the 400-line cap).

## Appendix B — glossary

- **fallback-on-error**: only used in `catch` / non-OK branch; correct usage when the value is empty/zero state.
- **mock-always**: assigned to UI even when `useQuery` succeeds.
- **no-API**: `FALLBACK_*` declared but no corresponding API call; UI never reflects backend state.
- **API**: `authFetch` to `api-server` (Express on port 3100/3200/3300 per `CLAUDE.md`).

End of report.
