# AGENT-289 — Real Filters & Search Audit

**Agent:** 289 — REAL-SYS #4
**Date:** 2026-04-29
**Scope:** All list pages across the 4 services. Are filters and search wired to a backend, do they paginate, and do they actually filter?

---

## Executive Verdict

**Filters and search are mostly UI-only client-side `Array.filter()` against whatever the API returned.** Server-side filter parameters exist on several endpoints but the UI never sends them. Pagination is silently capped on the server (default 50, max 200) for some endpoints, hardcoded to 200 for others, and **no list page in the UI exposes a paginator** — users will silently see only the first page with zero indication that more exist.

Only one component (`payroll-autonomous/src/components/TicketList.jsx`) implements proper client-side pagination + sort + filter. Tickets are paged at 25/page, but still over a fully-loaded array.

---

## 1. Inventory of List Pages Audited

| Page | File | Source of data |
|------|------|----------------|
| Clients (לקוחות) | `techno-kol-ops/client/src/pages/Clients.tsx` | API `/api/clients` |
| Employees (עובדים) | `techno-kol-ops/client/src/pages/Employees.tsx` | API `/api/employees` |
| Work Orders (הזמנות עבודה) | `techno-kol-ops/client/src/pages/WorkOrders.tsx` | API `/api/work-orders` |
| Materials (מחסן) | `techno-kol-ops/client/src/pages/Materials.tsx` | API `/api/materials` |
| Documents (browse) | `techno-kol-ops/client/src/pages/Documents.tsx` | hard-coded `MOCK_FILES` |
| Document Mgmt | `techno-kol-ops/client/src/pages/DocumentManagement.tsx` | localStorage (`DMS`) |
| Pipeline | `techno-kol-ops/client/src/pages/Pipeline.tsx` | API `/api/projects` |
| Purchasing | `techno-kol-ops/client/src/pages/Purchasing.tsx` | in-memory `RawMaterialRegistry` |
| Hours/Attendance | `techno-kol-ops/client/src/pages/HoursAttendance.tsx` | localStorage (`AbsenceStore`) |
| Alert Center | `techno-kol-ops/client/src/pages/AlertCenter.tsx` | API `/api/alerts` |
| Tickets | `payroll-autonomous/src/components/TicketList.jsx` | prop-supplied array |

---

## 2. Per-Page Findings

### 2.1 Clients (`Clients.tsx`)
**No filter, no search, no pagination at all.**
```ts
const { data: clients, fetch } = useApi<any[]>('/api/clients');
useEffect(() => { fetch(); }, []);
// renders (clients || []).map(...)
```
Server (`techno-kol-ops/src/routes/clients.ts:9-30`) **silently caps at 50 rows** (max 200 if `?limit=` provided), but the UI never sends `limit`/`offset`. Users get the first 50 clients ordered by `total_revenue DESC` with no UI hint that more exist.

### 2.2 Employees (`Employees.tsx`)
Same pattern as Clients. No search box, no filter UI. Server (`employees.ts:9-32`) caps at 50/200 but the UI doesn't paginate. The "{present}/{list.length} נוכחים" label is computed off the truncated 50.

### 2.3 Work Orders (`WorkOrders.tsx`)
- **Search**: client-side only:
  ```ts
  const filtered = (orders || []).filter(o =>
    !search || o.id.includes(search) || o.client_name?.includes(search) || o.product?.includes(search)
  );
  ```
- **AG-Grid filter**: uses `defaultColDef={{ sortable: true, resizable: true, filter: true }}` — also client-side over `rowData={filtered}`.
- Server (`workOrders.ts:11-39`) **supports** `status`, `material`, `client_id`, `from`, `to` query params with proper SQL `WHERE` clauses, **but the UI never sends any of them**. `fetch()` is called bare. **No `LIMIT` on this endpoint at all** — unbounded result set returned to browser, then filtered in JS.

### 2.4 Materials (`Materials.tsx`)
**Best-of-bad on this service.** Category tabs are server-side:
```ts
useEffect(() => { fetch(cat !== 'all' ? { category: cat } : {}); }, [cat]);
```
The server actually executes the filter (`materials.ts:20`):
```sql
if (category) { sql += ` AND mi.category = $1`; params.push(category); }
```
**But there is no `LIMIT`** — returns every active material. No free-text search.

### 2.5 Documents browse (`Documents.tsx`)
Pure client-side over a hardcoded `MOCK_FILES` array of 10 items. The category buttons + search box do filter, but the data is fake.
```ts
const filtered = MOCK_FILES.filter(f => {
  if (catFilter !== 'הכל' && f.category !== catFilter) return false;
  if (search && !f.name.includes(search) && !f.category.includes(search)) return false;
});
```

### 2.6 Document Management (`DocumentManagement.tsx`)
Fully client-side over `localStorage`-backed `DMS.search()` (engine in `client/src/engines/dmsEngine.ts:1087`). Free-text search and category/status selects do work — but everything is local-only, so the "search" never queries a real backend.

### 2.7 Pipeline (`Pipeline.tsx`)
Kanban grouping by stage, computed client-side:
```ts
acc[s.key] = (projects || []).filter(p => p.current_stage === s.key);
```
No search, no stage filter UI, no pagination.

### 2.8 Purchasing (`Purchasing.tsx`)
Two registries with full client-side filter+search (lines 263-270, 616-618). All data lives in `RawMaterialRegistry` in-memory engine + `seedDemoData()`. **Not connected to a backend.** Filters work but operate on demo seed only.

### 2.9 Alert Center (`AlertCenter.tsx`)
Splits into `open` and `resolved` via `.filter(a => !a.is_resolved)` and `.filter(a => a.is_resolved)`. No user-facing filter input, no search, no pagination.

### 2.10 Tickets (`TicketList.jsx`)
**The only page with proper filter + sort + pagination.** All client-side via `useMemo`:
- 5-field filter object (search, status, priority, assignee, tag)
- Sort by any column with toggle direction
- Paginated **client-side**, fixed `pageSize = 25`, prev/next buttons (lines 487-544, 902-933)

But: data is supplied as a `tickets` prop; the parent must fetch all of them. So the pagination is purely cosmetic — the entire dataset is already in memory.

---

## 3. Server-Side Pagination Reality

`grep "LIMIT|OFFSET" techno-kol-ops/src/routes/`:

| Route | Pagination | Notes |
|-------|-----------|-------|
| `clients.ts` | `LIMIT $1 OFFSET $2`, default 50, max 200 | **Comment claims "P0-1 fix"** but UI never sends params |
| `employees.ts` | `LIMIT $1 OFFSET $2`, default 50, max 200 | Same — UI never sends params |
| `leads.ts` | `LIMIT $1 OFFSET $2`, default 50, max 200 | Same |
| `financials.ts` (transactions) | Hard `LIMIT 200`, **non-parameterized** | Cannot page beyond 200 — silently truncated |
| `workOrders.ts` | **No LIMIT** | Unbounded — entire table to client |
| `materials.ts` | **No LIMIT** | Unbounded |
| `suppliers.ts` | **No LIMIT** | Unbounded |
| `gps.ts`, `messages.ts`, `signatures.ts`, `brain.ts`, `alerts.ts` | Have LIMIT (varies) | Not exposed in list UI |

`onyx-procurement/server.js` mostly uses Supabase queries with no `.range()` — `priceHistory` capped at `.limit(50)`, others unbounded.

---

## 4. Server-Side Filter Reality

Endpoints **with** real query-param filters (executed in SQL):

| Endpoint | Supported params | Used by UI? |
|----------|-----------------|-------------|
| `GET /api/work-orders` | `status`, `material`, `client_id`, `from`, `to` | NO |
| `GET /api/materials` | `category` | YES (Materials tabs) |
| `GET /api/financials/summary` | `period` | YES (period selector elsewhere) |

So out of three endpoints that bother to implement server-side filtering, only one (Materials) is actually wired to UI.

---

## 5. Patterns Summary

| Pattern | Count | Where |
|---------|-------|-------|
| Pure UI/no filter | 4 | Clients, Employees, Pipeline, AlertCenter |
| Client-side filter on full dataset | 5 | WorkOrders, Documents, DocumentManagement, Purchasing, HoursAttendance |
| Server-side filter via query param | 1 | Materials (`category`) |
| Client-side paginated (in-memory) | 1 | TicketList |
| Server-side paginated (LIMIT/OFFSET wired through API) | 0 |

---

## 6. Risks / Bugs Found

1. **Silent truncation, BUG-1**: `Clients`/`Employees`/`Leads` list pages render only the first 50 rows because the server defaults `LIMIT 50` and the UI never sends `?limit=`. There is no "load more" or page indicator. A tenant with 200+ clients will literally not see them. The page summary cards (e.g. "סה"כ עובדים") count only the truncated 50.

2. **Silent truncation, BUG-2**: `GET /api/financials` hardcodes `LIMIT 200`. Beyond 200 transactions, data is invisible to the UI with no way to page through.

3. **Unbounded queries, BUG-3**: `work-orders`, `materials`, `suppliers` routes have no `LIMIT`. Performance degrades linearly with table size; the entire result set is shipped to the browser, then filtered in JS. For a Palantir-grade ERP, this fails as soon as data scales.

4. **Wasted server filters, BUG-4**: `WorkOrders.tsx` has 5 server-side filter params available (`status`, `material`, `client_id`, `from`, `to`) but the UI never sends them. The page does its own client-side `.filter()` on `id`/`client_name`/`product` substring instead.

5. **AG-Grid `filter: true`, BUG-5**: Enables AG-Grid's built-in column filters in `WorkOrders.tsx`. These are client-side only — they filter the already-truncated client array, so a column filter on "status = ready" only finds matches inside the data already returned.

6. **Mock data masquerading as a real list, BUG-6**: `Documents.tsx` displays a hardcoded `MOCK_FILES` array of 10 items. There's no route fetch at all.

7. **No empty-state for pagination**: None of the list pages distinguish between "0 rows in DB" and "0 rows match your filter (more exist)". TicketList is the only one with an empty-state hint.

---

## 7. Recommendations (in build-priority order)

**P0**
- Wire `?limit`/`?offset` from UI to the existing paginated endpoints (Clients, Employees, Leads). Add a footer with row count + page controls modeled on TicketList.
- Add `LIMIT` (parameterized) to `work-orders`, `materials`, `suppliers`. Default 100, max 500.
- Add visible pagination controls on every list page.

**P1**
- Wire WorkOrders UI filters (`status` chip, `client_id` from a dropdown, `from`/`to` date range) to the existing server params. Drop the client-side `.filter()` on partial fetched data.
- Add server-side `?q` free-text search to clients/employees/work-orders/materials.

**P2**
- Build a shared `<DataTable>` primitive that handles filter + sort + paginate by always sending state to the server. The TicketList component is a reasonable visual reference but should not become the default — it loads everything client-side.

---

## 8. Bottom Line

Across roughly 11 list pages, exactly one (`Materials.tsx`) actually executes its filter on the server, and zero expose pagination to the user. Server-side LIMIT/OFFSET infrastructure exists on a handful of routes (with comments labeled "P0-1 fix") but is dead code from the UI's perspective — the filters look like they work, but they're working over a silently truncated 50-row sample. This is the kind of "looks fine in dev, breaks at the first real customer" bug that the No-Dead-Pages rule was supposed to prevent.

**Files of note (absolute paths):**
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\client\src\pages\Clients.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\client\src\pages\Employees.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\client\src\pages\WorkOrders.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\client\src\pages\Materials.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\src\routes\clients.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\src\routes\employees.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\src\routes\workOrders.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\src\routes\materials.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\src\routes\financials.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\client\src\hooks\useApi.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\payroll-autonomous\src\components\TicketList.jsx`
