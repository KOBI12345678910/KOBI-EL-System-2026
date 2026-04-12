# QA-14 — Performance Quick Wins (Top 10)

**Agent:** QA-14 — Performance Agent
**Date:** 2026-04-11
**Companion:** `_qa-reports/QA-14-performance.md` (full bug list + Go/No-Go verdict)

The 10 highest-ROI / lowest-effort improvements from the QA-14 audit. Each item is **under 4 developer-hours** and delivers visible, measurable perf wins at expected Techno-Kol Uzi production load. Fixes are ordered by **ROI ÷ effort**, not by severity.

All file paths are relative to the repo root `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\`.

---

## 1. Cache the brain engine result (P0-2)

**Effort:** ~30 min | **ROI:** Critical | **Risk:** Trivial

**File:** `techno-kol-ops/src/routes/brain.ts`

**Today:** Every `GET /api/brain/state` runs a full 6-phase engine cycle with ~9 aggregation queries. Cron already runs the same cycle every minute, so the HTTP work is 100% redundant.

**Drop-in fix:**
```ts
let lastState: any = null;
let lastAt = 0;
const TTL_MS = 30_000;

router.get('/state', async (_req, res) => {
  const now = Date.now();
  if (lastState && now - lastAt < TTL_MS) return res.json(lastState);
  const state = await brainEngine.runFullCycle();
  lastState = state;
  lastAt = now;
  res.json(state);
});
```

**Expected impact:** Dashboard DB load drops by **~90%** (only 1 cycle per 30s instead of 1 per HTTP GET × N tabs open). Expected p95 for `/api/brain/state` drops from 800ms to <5ms on cache hit.

---

## 2. Add `LIMIT` + pagination to unbounded GET endpoints (P0-1)

**Effort:** ~2 hours (8-10 routes) | **ROI:** Critical | **Risk:** Low (API contract expands)

**Files:**
- `techno-kol-ops/src/routes/workOrders.ts:10-38`
- `techno-kol-ops/src/routes/clients.ts:8-25,27-45`
- `techno-kol-ops/src/routes/employees.ts:8-20`
- `techno-kol-ops/src/routes/attendance.ts:25-45`
- `techno-kol-ops/src/routes/tasks.ts:10-34`
- `techno-kol-ops/src/routes/suppliers.ts:8-24`
- `techno-kol-ops/src/routes/leads.ts:9-21`
- `techno-kol-ops/src/services/pipeline.ts:490-517` (`getAllProjects`)

**Pattern (apply to each):**
```ts
const limit  = Math.min(Number(req.query.limit)  || 50, 200);
const offset = Math.max(Number(req.query.offset) || 0, 0);
// ... query with LIMIT $N OFFSET $N+1 ...
res.json({ rows: result.rows, limit, offset });
```

**Expected impact:** First-year payload per list call drops from 1-3 MB to 20-50 KB. DB scan shrinks from O(table) to O(page). Prevents visible front-end stalls after month-1.

---

## 3. Add composite index on `gps_locations(employee_id, timestamp DESC)` (P0-4)

**Effort:** ~5 min | **ROI:** Critical | **Risk:** Zero

**File:** `techno-kol-ops/src/db/schema.sql` (and a new migration)

**SQL:**
```sql
CREATE INDEX IF NOT EXISTS idx_gps_locations_employee_timestamp
  ON gps_locations (employee_id, timestamp DESC);
```

**Expected impact:** `GET /api/gps/history/:employeeId` latency drops from 500-2000ms (after 1 month of data) to <10ms. Also benefits LiveMap polling.

**Bonus (same file, also ~5 min):**
```sql
CREATE INDEX IF NOT EXISTS idx_attendance_employee_date
  ON attendance (employee_id, date DESC);
```

---

## 4. Bulk-insert `price_history` and webhook messages (P1-1, P1-2)

**Effort:** ~15 min | **ROI:** High | **Risk:** Zero

**Files:**
- `onyx-procurement/server.js:586-594` (`/api/quotes`)
- `onyx-procurement/server.js:1158-1173` (`/webhook/whatsapp`)

**Today:** `for (...) await supabase.from(...).insert(...)` — N round trips.

**Fix:**
```js
// quotes
const rows = lineItems.map(item => ({
  supplier_id,
  product_name: item.product_name,
  unit_price: item.unit_price,
  quoted_at: new Date().toISOString(),
}));
await supabase.from('price_history').insert(rows);

// webhook
const msgRows = messages.map(m => ({ from: m.from, body: m.text?.body, /* ... */ }));
await supabase.from('whatsapp_messages').insert(msgRows);
```

**Expected impact:** 20-line quote drops from ~400ms to ~20ms. Webhook batch drops from ~1s to ~50ms (and avoids Meta's 5s retry timeout).

---

## 5. Lazy-load heavy route pages (recharts / ag-grid / leaflet) (P1-7, P1-8, P1-9, P2-5)

**Effort:** ~1 hour | **ROI:** Very High (user-visible) | **Risk:** Low

**File:** `techno-kol-ops/client/src/App.tsx`

**Today:** All 25 page components imported eagerly. First bundle is >1.5 MB gzipped.

**Fix:**
```tsx
import { lazy, Suspense } from 'react';

const Dashboard         = lazy(() => import('./pages/Dashboard'));
const LiveMap           = lazy(() => import('./pages/LiveMap'));
const WorkOrders        = lazy(() => import('./pages/WorkOrders'));
const Pipeline          = lazy(() => import('./pages/Pipeline'));
const SituationDashboard= lazy(() => import('./pages/SituationDashboard'));
const FinancialAutonomy = lazy(() => import('./pages/FinancialAutonomy'));
// ... rest ...

<Suspense fallback={<div className="loading">טוען…</div>}>
  <Routes>…</Routes>
</Suspense>
```

**Expected impact:** Initial bundle drops **from ~1.5 MB to ~250 KB**. First paint on 3G drops from 8s to ~2s. Field workers on the commute can open the app.

---

## 6. Memoize `colDefs` / `filtered` / `byStage` in client pages (P1-10, P1-8)

**Effort:** ~45 min | **ROI:** High | **Risk:** Zero

**Files:**
- `techno-kol-ops/client/src/pages/WorkOrders.tsx:16,20-58`
- `techno-kol-ops/client/src/pages/Pipeline.tsx:51-56`
- `techno-kol-ops/client/src/pages/LiveMap.tsx:91-95`

**Fix pattern:**
```tsx
// WorkOrders.tsx
const colDefs = useMemo<ColDef[]>(() => [
  { field: 'order_number', headerName: 'מס' },
  // ...
], []);

const defaultColDef = useMemo(() => ({ sortable: true, filter: true, resizable: true }), []);

const filtered = useMemo(
  () => workOrders.filter(o => (statusFilter === 'all' || o.status === statusFilter)),
  [workOrders, statusFilter]
);
```

**Expected impact:** AgGrid re-layouts drop from every render to only when data/filter changes. LiveMap 15s tick stops recreating marker list identity, preventing unneeded leaflet redraws.

---

## 7. Atomic materials stock update with `RETURNING` (P1-5)

**Effort:** ~15 min | **ROI:** High (also fixes correctness bug) | **Risk:** Zero

**File:** `techno-kol-ops/src/routes/materials.ts:98-108`

**Today:** 3 round trips (SELECT → UPDATE → SELECT), racy.

**Fix:**
```ts
const r = await query(
  `UPDATE material_items
      SET quantity_in_stock = quantity_in_stock - $1
    WHERE id = $2 AND quantity_in_stock >= $1
    RETURNING id, name, quantity_in_stock, unit, updated_at`,
  [qty, id]
);
if (r.rowCount === 0) return res.status(400).json({ error: 'insufficient_or_not_found' });
res.json(r.rows[0]);
```

**Expected impact:** 3x fewer DB round-trips on every material consumption. Kills a TOCTOU inventory race at the same time.

---

## 8. Replace `SELECT *` with column projections in hot endpoints (P1-4, P2-4, P2-15)

**Effort:** ~2 hours | **ROI:** High (bandwidth + PII security) | **Risk:** Low

**Files:**
- `techno-kol-ops/src/routes/employees.ts:11` — remove `salary, id_number` from public list
- `techno-kol-ops/src/routes/workOrders.ts:10-38`
- `techno-kol-ops/src/routes/clients.ts:8-25`
- `techno-kol-ops/src/routes/reports.ts:31-78`
- `onyx-procurement/src/payroll/payroll-routes.js` — define `WAGE_SLIP_LIST_COLUMNS` constant

**Fix pattern:**
```ts
// employees.ts
const PUBLIC_EMPLOYEE_COLS = 'id, name, role, phone, status, updated_at';
const result = await query(
  `SELECT ${PUBLIC_EMPLOYEE_COLS}, COUNT(woe.id) AS total_assignments
     FROM employees e LEFT JOIN work_order_events woe ON woe.employee_id = e.id
    GROUP BY e.id
    ORDER BY e.name
    LIMIT $1 OFFSET $2`,
  [limit, offset]
);
```

**Expected impact:** 30-40% smaller list payloads. Removes accidental PII leak (`salary`, `id_number`) from the employees list response — also addresses the QA-13 security audit.

---

## 9. Replace `fs.existsSync` / `fs.statSync` in payroll hot path (P1-6)

**Effort:** ~15 min | **ROI:** Medium | **Risk:** Zero

**File:** `onyx-procurement/src/payroll/pdf-generator.js:57,233` + `onyx-procurement/src/payroll/payroll-routes.js:305`

**Today:**
```js
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });      // line 57
const stats = fs.statSync(outputPath);                                // line 233
if (fs.existsSync(pdfPath)) { /* ... */ }                             // payroll-routes.js:305
```

**Fix:**
```js
const fsp = require('fs').promises;

await fsp.mkdir(dir, { recursive: true });           // replaces existsSync+mkdirSync
const stats = await fsp.stat(outputPath);            // replaces statSync
try { await fsp.access(pdfPath); /* exists */ }      // replaces existsSync
catch { /* not exists */ }
```

**Expected impact:** Stops blocking the event loop on fs calls during end-of-month PDF batch. On networked storage (Azure Files / NFS) this is the difference between "usable" and "stalled".

---

## 10. Queue PDF generation (P0-3)

**Effort:** ~3 hours | **ROI:** Critical (prevents monthly outages) | **Risk:** Low

**File:** `onyx-procurement/src/payroll/payroll-routes.js:280`

**Today:** `await generateWageSlipPdf(slip, outputPath)` runs inline inside the request handler. HR issuing 60 slips back-to-back stalls the Node process for 3-12 seconds of CPU.

**Fix — minimal viable queue:**
```js
const PQueue = require('p-queue').default;
const pdfQueue = new PQueue({ concurrency: 2 });

router.post('/wage-slips/:id/issue', async (req, res) => {
  // 1. Validate + mark status='issuing' synchronously (fast)
  const { data: slip, error } = await supabase.from('wage_slips').select(WAGE_SLIP_LIST_COLUMNS).eq('id', req.params.id).single();
  if (error || !slip) return res.status(404).json({ error: 'not_found' });
  if (slip.status !== 'approved') return res.status(400).json({ error: 'bad_status' });
  await supabase.from('wage_slips').update({ status: 'issuing' }).eq('id', slip.id);

  // 2. Schedule PDF generation out-of-band
  pdfQueue.add(async () => {
    const outputPath = path.join(WAGE_SLIPS_DIR, slip.pdf_filename);
    try {
      await generateWageSlipPdf(slip, outputPath);
      await supabase.from('wage_slips').update({ status: 'issued', issued_at: new Date().toISOString() }).eq('id', slip.id);
    } catch (err) {
      console.error('[payroll] PDF job failed', slip.id, err);
      await supabase.from('wage_slips').update({ status: 'approved', issue_error: err.message }).eq('id', slip.id);
    }
  });

  // 3. Respond immediately
  res.status(202).json({ job_id: slip.id, status: 'issuing' });
});
```

Also change `GET /wage-slips/:id/pdf` to 404 (not regenerate) if file missing — caller polls `status` until `issued`.

**Expected impact:** Batch issuance of 60 wage slips drops from 12 seconds of stalled event loop to ~2 seconds of background work. Other HTTP endpoints stay responsive throughout end-of-month.

---

## Summary table

| # | Item                                                    | Effort | ROI       | Touches severity |
|---|---------------------------------------------------------|--------|-----------|------------------|
| 1 | Cache brain engine result                               | 0.5 h  | Critical  | P0-2             |
| 2 | Pagination on unbounded GETs                            | 2 h    | Critical  | P0-1             |
| 3 | Composite index on gps_locations                        | 5 min  | Critical  | P0-4             |
| 4 | Bulk insert price_history / webhook messages            | 15 min | High      | P1-1, P1-2       |
| 5 | Lazy-load client pages via React.lazy                   | 1 h    | Very High | P1-7..9, P2-5    |
| 6 | Memoize colDefs / filtered / byStage                    | 45 min | High      | P1-10            |
| 7 | Atomic materials stock update with RETURNING            | 15 min | High      | P1-5             |
| 8 | SELECT column projections in hot endpoints              | 2 h    | High      | P1-4             |
| 9 | Replace sync fs calls in payroll PDF path               | 15 min | Medium    | P1-6             |
| 10| Queue PDF generation                                    | 3 h    | Critical  | P0-3             |

**Total effort to clear all 10: ~10-11 developer-hours (~1.5 days).**

**Result after all 10:**
- All four P0 items from `QA-14-performance.md` are resolved → **NO-GO → GO** on the perf axis.
- 7 of 13 P1 items are resolved.
- First-paint on client drops from 8s to ~2s on 3G.
- p95 API latency drops from 500-2000ms to 50-200ms on Dashboard, LiveMap, WorkOrders.
- End-of-month wage-slip batch no longer stalls the server.
- GPS history stays snappy past month-1.

---

**— End of QA-14 Quick Wins**
