# AGENT-330 — Sidebar / Menu Rendering Audit

Audit of frontend sidebars across the three services. All findings verified
in source. Paths are absolute relative to repo root.

## TL;DR

| Service | Sidebar source | `/api/app-menu`? | Hebrew | Categories | Active state | Permission filter | RTL |
|---|---|---|---|---|---|---|---|
| **techno-kol-ops** (3200, mounted) | `client/src/components/Sidebar.tsx` (legacy hard-coded `NAV` list) | NO | YES | YES (string `section`) | YES (`aria-current=page`) | NO | YES (parent layout) |
| **techno-kol-ops** (`AppShell` wiring, NOT mounted) | `client/src/components/layout/Sidebar.tsx` + `services/menuService.ts` | NO — direct Supabase `app_menu` table | YES (DB labels) | YES (parent/child tree) | YES (`aria-current=page`) | NO (`required_permission` ignored) | YES (`dir="rtl"` in `AppShell`) |
| **erp-app** (Wouter SPA) | `src/components/layout.tsx` + `<DynamicMenuItemsSection>` | NO — calls `${API_BASE}/platform/menu-items` | YES | YES (`section` + `subSection`) | YES (route prefix match + active rail) | YES (`canAccessSection` + `RouteGuard` + `hasBuilderAccess`) | YES (root `<html dir="rtl">`) |
| **payroll-autonomous** (5173) | `src/App.jsx` inline `Sidebar` + `NAV_GROUPS` const | NO | YES | YES (groups) | YES (`aria-current=page`, `.active` class) | NO | YES (CSS `direction: rtl`) |

**No service calls `/api/app-menu`. No backend route exposes `/api/app-menu`.**
Greps over `api-server/`, `onyx-procurement/`, `techno-kol-ops/server/` returned zero matches.

---

## 1. techno-kol-ops — TWO sidebars exist; only the legacy one renders

`techno-kol-ops/client/src/main.tsx` mounts `<App />` directly inside
`<BrowserRouter>` — it does **not** import `router/index.tsx`. So the
shell that actually renders is `App.tsx` → `<Layout>` → `<Sidebar />`
(legacy), and the `AppShell`/`createBrowserRouter` graph in
`router/index.tsx` is dead code today.

### 1a. Mounted sidebar — `client/src/components/Sidebar.tsx`

- **Data source**: hard-coded `NAV` array, 38 items, with `path`, `label`,
  `icon` (emoji), `section`. No fetch.
- **Hebrew labels**: yes — `'דשבורד'`, `'תמונת מצב'`, `'רכש היפר-אינטליגנטי'`,
  `'חדר בקרה תפעולי'`, etc.
- **Categories**: yes — 7 sections (`'מרכז פיקוד'`, `'ייצור'`, `'חומרים'`,
  `'כוח אדם'`, `'פיננסים'`, `'דוחות'`, `'מערכת'`, `'חדרי בקרה'`). Built
  with `[...new Set(NAV.map(n => n.section))]`.
- **Active state**: `const active = location.pathname === item.path` →
  background `rgba(255,165,0,0.1)`, left border `#FFA500`, color `#FFA500`,
  plus `aria-current={active ? 'page' : undefined}`. Exact-match only,
  so child routes (e.g. `/work-orders/123`) lose highlight on the parent.
- **Permission filtering**: NONE. All 38 entries render for every user.
- **Badge**: only `/alerts` shows `snapshot.openAlerts` count.
- **RTL**: no explicit `dir` on the sidebar `<div>`, but
  `client/src/App.tsx` Layout wraps everything in
  `<div style={{ direction: 'rtl' }}>` (line 90). Sidebar position is
  `position: fixed; left: 0`, NOT mirrored to `right: 0`, so under RTL it
  visually sits on the **logical end** (the wrong side for a primary
  Hebrew sidebar). The newer `client/src/components/Layout.tsx` (used by
  `AppShell`) sets `dir="rtl"` correctly.

### 1b. Dead-code sidebar — `client/src/components/layout/Sidebar.tsx`

Used only by `client/src/app/AppShell.tsx`, which `router/index.tsx`
references but `main.tsx` never mounts.

- **Data source**: `services/menuService.ts` → `supabase.from('app_menu').select('*').order('order_index')`.
  This is a **direct PostgREST call**, not `/api/app-menu`. Returns
  `MenuItem[]` with `{ id, label, route, icon, parent_id, order_index, required_permission }`,
  built into a parent→children tree.
- **Hebrew labels**: yes (DB-driven; `'תפריט ראשי'`, `'טוען תפריט...'`,
  `'אין פריטי תפריט'`).
- **Categories / hierarchy**: yes — recursive `renderItem(item, depth)`
  with `aria-expanded`, collapsible chevron `◀`, indented children.
- **Active state**: `const active = item.route ? location.pathname === item.route : false`,
  `aria-current="page"`, Tailwind `bg-blue-600 text-white font-medium`.
  Exact match only — same prefix issue.
- **Permission filtering**: **NOT IMPLEMENTED**. `MenuItem` carries
  `required_permission` but `Sidebar` never reads it. The DB column is
  populated (see migrations `00064`, `00066`, `00067` adding menu rows),
  but the UI shows every row regardless of role.
- **Loading state**: yes (`'טוען תפריט...'`).
- **Empty state**: yes (`'אין פריטי תפריט'`).
- **Accessibility**: `role="menubar"`, `role="menuitem"`, `aria-label="תפריט ראשי"`,
  keyboard-focusable buttons. Better than the legacy sidebar.
- **RTL**: parent shell sets `dir="rtl"` (`AppShell.tsx:37`); class uses
  `border-l border-gray-700/50` and `text-right` on items, which is
  intentional for a right-aligned RTL sidebar.

**Net effect**: the codebase ships two divergent sidebars. The accessible,
DB-backed one with permission infrastructure is wired into a router that
isn't loaded. Switching `main.tsx` to use `RouterProvider router={router}`
would activate it but **also remove every page-level data-flow that the
legacy Layout provides** (`useWebSocket`, `useAutonomousPipeline`,
sidebar collapse via `useStore`).

---

## 2. erp-app — Single canonical sidebar in `components/layout.tsx`

`erp-app/src/components/layout.tsx` is the only sidebar consumed in the
running app. The `components/ui/sidebar.tsx` file is the shadcn/ui
primitive (`SidebarProvider`, `SidebarMenuButton`, etc.) and is **not
imported anywhere in the app** (grep `Sidebar|sidebar` in `erp-app/src/`
hits only `components/ui/sidebar.tsx` itself, plus unrelated icon imports
on pages). It's dead vendor code in the running tree.

### Active sidebar (`Layout` component, ~line 2036 onward)

- **Data sources**:
  - **Static**: `NAV_ITEMS` array (~700 entries, line 183), grouped by
    Hebrew `section` (`'ראשי'`, `'תקשורת ושיתוף פעולה'`, `'מנוע בינה מלאכותית — AI'`,
    `'לקוחות ומכירות'`, etc.) and optional `subSection` (e.g. `'מנוע ראשי'`,
    `'אנליטיקס'`, `'Kimi Terminal'`).
  - **Dynamic strategy items**: `useStrategyNavItems()` → React-Query of
    `/platform/modules` + `/platform/entities/slug-map`.
  - **Dynamic platform menu**: `<DynamicMenuItemsSection>` (line 1303)
    queries `${API_BASE}/platform/menu-items`, builds a parent/child tree
    (`parentId`, `sortOrder`), groups by `section` (default `'תפריט דינמי'`),
    renders via `<DynamicMenuItem>` with recursive depth-indent.
  - **Live badges**: `${API_BASE}/payment-anomalies/stats` (refetch 5min)
    and `${API_BASE}/live-ops/history` (refetch 30s) inject badge counts
    onto specific nav hrefs.
- **Hebrew labels**: yes. Static labels are Hebrew throughout; dynamic
  items use `item.labelHe || item.label || item.name`.
- **Categories**: yes — `SECTION_ORDER` (line 2145) defines an explicit
  19-section ordering; `CollapsibleSection` (line 1591) renders each
  collapsible group with item-count badge and chevron.
- **Active state**: `<NavLink>` (line 1532) computes
  `isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href))`
  → prefix-aware (correct for `/work-orders/123` highlighting `/work-orders`).
  Active item gets `bg-primary/10 text-primary font-medium` plus an absolute
  right-edge rail (`<div className="absolute right-0 ... w-1 h-6 bg-primary rounded-l-full" />`).
  Sections auto-expand when they contain the active route
  (`useEffect` on `hasActiveItem`).
- **Permission filtering**: **YES — implemented in three layers**:
  1. `BUILDER_SECTIONS = ["בונה מערכת"]` hidden when `!hasBuilderAccess()` (line 2131).
  2. `shouldFilterByPermissions = !isSuperAdmin && !isDevMode && hasAnyPermissions`
     gates all sections through `canAccessSection(section, permissions, moduleSlugMap)`,
     which consults `SECTION_MODULE_MAP` (line 1467) mapping Hebrew section
     names to module slugs (`'לקוחות ומכירות' → ['customers-sales','pricing-billing']`, etc.).
  3. Route-level `<RouteGuard>` (line 1871) double-guards with
     `__admin_only__`, `OPEN_ROUTE_PREFIXES`, builder prefixes, and
     module view/manage flags. Unauthorized renders Hebrew Shield panel.
- **Collapse**: persisted in `localStorage["sidebar-collapsed"]`. Collapsed
  mode shows icon-only rail with hover tooltips of the section name.
- **Mobile**: `isMobileMenuOpen` toggles `<aside>` translation, with backdrop overlay.
- **RTL**: root `erp-app/index.html` sets `<html lang="he" dir="rtl">`.
  `<aside>` uses `border-l` (right-side border in RTL = visually correct
  for sidebar on right edge) and `right-0` positioning. Active rail is
  on `right-0` (correct RTL leading edge). Inner items use `text-right`
  on dynamic links.

### Endpoint summary (erp-app)

- `GET /api/platform/menu-items` — dynamic top-level menu rows.
- `GET /api/platform/modules` — module slug map.
- `GET /api/platform/entities/slug-map` — entity slug → id.
- `GET /api/payment-anomalies/stats` — anomaly badge.
- `GET /api/live-ops/history` — live-ops badge.

No `/api/app-menu`.

---

## 3. payroll-autonomous — Inline sidebar in `App.jsx`

`payroll-autonomous/src/App.jsx` defines `function Sidebar(...)` at line 1028
and a `NAV_GROUPS` const at line 132.

- **Data source**: hard-coded `NAV_GROUPS` (line 132), 8 groups, ~50 items
  by `id` (tab id) — no `path`. Tabs are switched via `setTab(id)`, not
  via React Router. No fetch.
- **Hebrew labels**: yes — every `label` is Hebrew or Hebrew+emoji
  (`'תלושי שכר'`, `'חישוב תלוש'`, `'📐 מחשבון BOM'`, `'👔 דשבורד מנכ"ל'`,
  `'⚙️ ניהול מערכת'`).
- **Categories**: yes — 8 groups: `'שכר'`, `'רכש ומכירות'`, `'ניתוח ומעקב'`,
  `'פורטלים'`, `'Enterprise'`, `'עוזרי AI'`, `'דוחות'`, `'מערכת'`. Each
  rendered with `.sidebar-group-label` (uppercase, dim).
- **Active state**: per-item `<button className="sidebar-item ${activeTab === item.id ? 'active' : ''}">`
  with `aria-current={activeTab === item.id ? 'page' : undefined}` (line 1114, 1133).
  Active style (CSS line 246): accent text, accent-tinted background,
  3px right border, font-weight 600.
- **Permission filtering**: NONE. All groups/items render for everyone.
  No role/scope check anywhere in the sidebar render path.
- **Search**: built-in fuzzy search input at top of sidebar
  (`sidebarQuery` state) that filters `allItems` across all groups
  (line 1031). Two render branches — one for filtered hits, one for
  grouped default.
- **RTL**: CSS line 210 sets `body, html, #root { direction: rtl }`,
  and `.sidebar { border-left: 1px solid ... }` (RTL-correct end-border).
  `.sidebar-item { text-align: right }` (line 244). Active border is
  `border-right: 3px solid` (RTL leading edge → correct).
- **Mobile**: `@media (max-width: 768px)` flips sidebar to a horizontal
  scrolling strip (`flex-direction: column` on layout, sidebar becomes
  full-width with `overflow-x: auto`).

---

## 4. Cross-cutting findings

1. **No `/api/app-menu` anywhere.** The string does not exist in any
   client, server, or migration. The only menu-table-driven UI is the
   dead-code `AppShell` in techno-kol-ops, which queries Supabase
   `app_menu` directly via PostgREST (no REST wrapper).
2. **`required_permission` column is populated but ignored.**
   Migrations `00064`, `00066`, `00067` add menu wiring with
   permission columns; `menuService.ts` returns the field on `MenuItem`;
   `Sidebar` never reads it. If/when `AppShell` is mounted, every user
   would see every menu row.
3. **Three different menu strategies in one repo**:
   - techno-kol-ops mounted: hard-coded TS array.
   - erp-app: hybrid (large hard-coded `NAV_ITEMS` + DB-driven
     `platform/menu-items` + per-route guard).
   - payroll-autonomous: hard-coded JS array, tab-based (no router).
   Only erp-app filters by permissions.
4. **Active-state matching is inconsistent**: erp-app uses
   `startsWith(prefix)`; both techno-kol-ops sidebars use exact
   `===` match; payroll uses tab id equality (its own model).
5. **RTL is correctly applied** at the document or layout root in all
   three apps. The legacy techno-kol-ops sidebar
   (`components/Sidebar.tsx`) is the one weak spot — it's
   `position: fixed; left: 0` instead of `right: 0`, so under
   `direction: rtl` the sidebar sits at the visual right edge (logical
   start) which is conventional, but the inline `borderRight: '1px solid ...'`
   is on the wrong logical edge. Cosmetic only.
6. **erp-app `components/ui/sidebar.tsx`** is shadcn vendor code with
   full `SidebarProvider`/`SidebarMenuButton` API but **zero call sites**
   in the app — the running sidebar is the bespoke one in `layout.tsx`.

## Files referenced

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\client\src\components\Sidebar.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\client\src\components\layout\Sidebar.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\client\src\app\AppShell.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\client\src\services\menuService.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\client\src\router\index.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\client\src\main.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\client\src\App.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\client\src\components\Layout.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\components\layout.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\components\ui\sidebar.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\index.html`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\payroll-autonomous\src\App.jsx`
