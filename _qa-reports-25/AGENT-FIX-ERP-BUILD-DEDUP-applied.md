# AGENT-FIX-ERP-BUILD-DEDUP — Applied

## Task
Fix duplicate-symbol errors in `erp-app/src/App.tsx` blocking the Vite/esbuild production build.

## Build Status

| Stage                 | Status                                                                     |
|-----------------------|----------------------------------------------------------------------------|
| Before                | FAIL — esbuild aborted with 17 "symbol has already been declared" errors   |
| After                 | All duplicate-symbol errors RESOLVED                                       |
| Current build state   | FAIL on UNRELATED issue — Rollup cannot resolve `wouter` module (missing dep) |

## Duplicates Removed (17 declarations, all from the legacy top section, lines 14-42)

Strategy: when two declarations existed, kept the one in the auto-wired section (uses `lazyPage` with `@/` alias and is the canonical wiring), or kept the earlier auto-wired entry on identical-path collisions. Removed the older `lazy(...)` shims at the top.

| Symbol                    | Removed (line) | Kept (line) | Kept import path                            |
|---------------------------|----------------|-------------|---------------------------------------------|
| `OpportunitiesPage`       | 15             | 78          | `./pages/sales/opportunities`               |
| `DashboardPage`           | 16             | 29 (was 44) | `./pages/dashboard`                         |
| `CrmPipelinePage`         | 17             | 34 (was 49) | `./pages/sales/crm-pipeline`                |
| `CrmActivitiesPage`       | 18             | 863 lazyPage | `@/pages/crm/crm-activities`               |
| `SupplierScorecardsPage`  | 19             | 662         | `./pages/supplier-mgmt/supplier-scorecards` |
| `ContractsPage`           | 21             | 32 (was 47) | `./pages/documents/contracts`               |
| `VendorNegotiationPage`   | 22             | 349         | `./pages/procurement/vendor-negotiation`    |
| `SupplierManagementPage`  | 23             | 346         | `./pages/procurement/supplier-management`   |
| `RawMaterialStockPage`    | 24             | 340         | `./pages/procurement/raw-materials/raw-material-stock` |
| `IncomePage`              | 25             | 764 lazyPage | `@/pages/finance/income`                   |
| `ExpensesPage`            | 26             | 765 lazyPage | `@/pages/finance/expenses`                 |
| `ShiftsPage`              | 28             | 806 lazyPage | `@/pages/hr/shifts`                        |
| `LoginPage`               | 31             | 696 lazyPage | `@/pages/login`                            |
| `IntegrationSettingsPage` | 36             | 715 lazyPage | `@/pages/integration-settings`             |
| `ApiKeysPage`             | 37             | 791 lazyPage | `@/pages/api-keys`                         |
| `PredictiveAnalyticsPage` | 42             | 889 lazyPage | `@/pages/ai-engine/predictive-analytics`   |
| `CompanyFinancialsPage`   | 28 (orig)      | 1027 lazyPage | `@/pages/company-financials`              |

Total LOC removed: **17 lines** (under 30 LOC budget).

## Verification

```
$ npx tsc --noEmit 2>&1 | grep -E "(PredictiveAnalyticsPage|CompanyFinancialsPage)"
(empty)

$ npm run build 2>&1 | grep "has already been declared"
(empty — all 17 duplicate-symbol errors resolved)
```

## Remaining Build Blocker (out of scope)

```
[vite]: Rollup failed to resolve import "wouter" from ".../erp-app/src/App.tsx".
```

`wouter` is the routing library used by the App.tsx component routes. It is not installed in `erp-app/node_modules`. This is an unrelated dependency issue that should be handled in a separate task (likely `npm install wouter` in the `erp-app` workspace, or aligning the workspace dependency tree).

## Files Touched

- `erp-app/src/App.tsx` — 17 lines removed
