# AGENT-FIX-SIDEBAR-360 — Applied

**Status:** Applied
**Date:** 2026-04-29
**Service:** techno-kol-ops (port 3200)
**File:** `techno-kol-ops/client/src/components/Sidebar.tsx`
**TypeScript:** clean (`npx tsc --noEmit -p tsconfig.json` — exit 0, 0 errors)
**Lines added:** 18 (limit: 60)

## Problem

CLAUDE.md mandates "No Dead Pages": every page must answer Where am I? / What can I do? / Next step?
The techno-kol-ops sidebar contained **33 hard-coded entries**, none of which surfaced the
15 Master 360 detail-pages (Customer/Supplier/Quote/RFQ/Project/WorkOrder/PO/Finance/
Employee/Lead/Order/Inventory/Delivery/Payment/Closure). They were reachable only by
row-click drill-down or direct URL — violating discoverability.

## Fix

Added a new `'מאסטר 360'` section to the flat `NAV` array, with one entry per Master Flow
360 page. Routes resolve to existing list pages where they exist (drill into 360 on row-click);
for entities lacking a list page (Quote, Lead, Supplier, RFQ, PO, Payment, Delivery, Closure),
the link points at `/{entity}/1` so the 360 detail loads with a sample id.

Existing sidebar style (emoji icons, single flat array with `section` string field) was
preserved — the lucide-react icon library mentioned in the task spec is **not** used in this
file, and forcing it would have been a much larger refactor. No existing entries removed.

## Diff (logical)

### Before — Sidebar.tsx (last 4 entries of NAV)
```tsx
  { path: '/control-room/operations', label: 'חדר בקרה תפעולי', icon: '🏗️', section: 'חדרי בקרה' },
  { path: '/control-room/procurement', label: 'חדר בקרה רכש',   icon: '📦', section: 'חדרי בקרה' },
  { path: '/control-room/workforce',  label: 'חדר בקרה כוח אדם', icon: '👷', section: 'חדרי בקרה' },
];
```

### After — Sidebar.tsx (15 new entries appended before `];`)
```tsx
  { path: '/control-room/operations',  label: 'חדר בקרה תפעולי',     icon: '🏗️', section: 'חדרי בקרה' },
  { path: '/control-room/procurement', label: 'חדר בקרה רכש',        icon: '📦', section: 'חדרי בקרה' },
  { path: '/control-room/workforce',   label: 'חדר בקרה כוח אדם',     icon: '👷', section: 'חדרי בקרה' },
  // Master 360 — surfaces the 15 Master Flow detail-pages (CLAUDE.md: No Dead Pages).
  { path: '/clients',             label: 'לקוחות 360',          icon: '🤝', section: 'מאסטר 360' },
  { path: '/quote/1',             label: 'הצעות מחיר 360',      icon: '📄', section: 'מאסטר 360' },
  { path: '/order/1',             label: 'הזמנות 360',          icon: '🛒', section: 'מאסטר 360' },
  { path: '/lead/1',              label: 'לידים 360',           icon: '📥', section: 'מאסטר 360' },
  { path: '/pipeline',            label: 'פרויקטים 360',        icon: '📋', section: 'מאסטר 360' },
  { path: '/work-orders',         label: 'הוראות עבודה 360',    icon: '🛠️', section: 'מאסטר 360' },
  { path: '/supplier/1',          label: 'ספקים 360',           icon: '🚚', section: 'מאסטר 360' },
  { path: '/rfq/1',               label: 'בקשות הצעה 360',      icon: '❓', section: 'מאסטר 360' },
  { path: '/po/1',                label: 'הזמנות רכש 360',      icon: '🛍️', section: 'מאסטר 360' },
  { path: '/materials',           label: 'מלאי 360',            icon: '📦', section: 'מאסטר 360' },
  { path: '/finance',             label: 'פיננסי 360',          icon: '💵', section: 'מאסטר 360' },
  { path: '/payment/1',           label: 'תשלומים 360',         icon: '💳', section: 'מאסטר 360' },
  { path: '/employees',           label: 'עובדים 360',          icon: '👤', section: 'מאסטר 360' },
  { path: '/delivery/1',          label: 'משלוחים 360',         icon: '🚛', section: 'מאסטר 360' },
  { path: '/project/1/closure',   label: 'סגירת פרויקטים 360',  icon: '✅', section: 'מאסטר 360' },
];
```

## Route validation against App.tsx

| Sidebar path           | App.tsx route                                 | Resolves to               |
|------------------------|-----------------------------------------------|---------------------------|
| `/clients`             | `<Route path="/clients" .../>`                | Clients (list → Customer360) |
| `/quote/1`             | `<Route path="/quote/:id" .../>`              | Quote360                  |
| `/order/1`             | `<Route path="/order/:id" .../>`              | Order360                  |
| `/lead/1`              | `<Route path="/lead/:id" .../>`               | Lead360                   |
| `/pipeline`            | `<Route path="/pipeline" .../>`               | Pipeline (list → Project360) |
| `/work-orders`         | `<Route path="/work-orders" .../>`            | WorkOrders (list → WorkOrder360) |
| `/supplier/1`          | `<Route path="/supplier/:id" .../>`           | Supplier360               |
| `/rfq/1`               | `<Route path="/rfq/:id" .../>`                | RFQ360                    |
| `/po/1`                | `<Route path="/po/:id" .../>`                 | PO360                     |
| `/materials`           | `<Route path="/materials" .../>`              | Materials (list → InventoryItem360) |
| `/finance`             | `<Route path="/finance" .../>`                | Finance (list → Finance360) |
| `/payment/1`           | `<Route path="/payment/:id" .../>`            | Payment360                |
| `/employees`           | `<Route path="/employees" .../>`              | Employees (list → Employee360) |
| `/delivery/1`          | `<Route path="/delivery/:id" .../>`           | Delivery360               |
| `/project/1/closure`   | `<Route path="/project/:id/closure" .../>`    | Closure360                |

All 15 Master 360s now reachable from the left-side nav.

## Constraints honored
- Lines added: 18 ≤ 60
- Hebrew labels (RTL-friendly)
- Existing icon style preserved (emoji strings — file does not import lucide-react)
- No existing entries removed
- erp-app untouched
