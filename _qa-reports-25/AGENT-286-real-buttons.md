# AGENT-286 — Real-System Audit #1: Client Buttons

**Scope**: All buttons across active client apps in 4 services.
**Method**: Static scan of `onClick=` / `onclick=` handlers. Verified handler definition, API wiring, destructive-confirmation, and loading state.
**Date**: 2026-04-29

---

## 1. Inventory (active client apps)

| App / Service | Path | `<button` count | `onClick` handler count | Status |
|---|---|---:|---:|---|
| TECHNO_KOL_OPS (React/TS) | `techno-kol-ops/client/src/` | 269 buttons in 48 files | 403 handlers in 72 files | ACTIVE |
| PAYROLL_AUTONOMOUS (React/JSX+TS) | `payroll-autonomous/src/` | n/a (mixed) | 305 handlers in 52 files | ACTIVE |
| ONYX_PROCUREMENT — web/ HTML | `onyx-procurement/web/*.html` | 171 buttons in 13 files | 97 onclick in 8 files | ACTIVE (legacy, vanilla JS) |
| ONYX_PROCUREMENT — web/ JSX | `onyx-procurement/web/*.jsx` | (counted above) | embedded React handlers | ACTIVE |
| ONYX_AI (server-side) | `onyx-ai/src/` | 0 client buttons | 0 onClick | NO CLIENT (server-only) |

> ONYX_AI ships no browser UI in `src/`; it serves API only on :3300. Mounted via reverse proxy at `/ai`. **Excluded** from button audit.

> Total auditable surface: **805 onClick/onclick instances** across **133 files**.

---

## 2. Audit dimensions per button

| Dimension | Definition | Pass criteria |
|---|---|---|
| D1: Handler defined | `onClick={fn}` resolves to a real function (not a missing identifier) | Static-resolved |
| D2: Real API call | Handler invokes `fetch`/`axios`/`api.*`/`useMutation`/state-machine adapter, NOT `alert()` / `console.log()` only | Posts to a real endpoint or invokes a state-machine fn that does |
| D3: Destructive confirm | Delete / cancel / block / reject / close-as-failure prompts via `window.confirm` or modal | Confirm gate present |
| D4: Loading state | Button shows `disabled`, spinner, or `actionLoading` flag while async runs | At least one of: `disabled={…loading}`, spinner UI, optimistic disable |

---

## 3. Findings — TECHNO_KOL_OPS / client

### 3.1 360 pages (P0) — Project360, WorkOrder360, Customer360, etc.

**Sample: `pages/WorkOrder360.tsx` & `pages/Project360.tsx`**

- 34 onClick handlers in WorkOrder360, ~28 in Project360.
- All flow through a shared `executeAction(actionId)` and `transitionState(...)` pattern. Resolves to:
  ```ts
  await api.post('/api/orchestrator/execute', { entity, entity_id, action: actionId });
  ```
  Hits the real `pipeline/orchestrator.js` endpoint (matches `CLAUDE.md` § Key APIs).
- D1 PASS: every button targets `executeAction` / `transitionState` defined locally.
- D2 PASS: Real POST to `/api/orchestrator/execute`. No stubs.
- D3 PARTIAL: Project-close (`transitionState('closed')`) and WO sign-off lack `window.confirm`. Soft destructive (state, not delete) — **finding**: add confirm dialogue.
- D4 PASS: Every action button has `disabled={!!actionLoading}`; `actionLoading` is set/cleared in try/finally.

### 3.2 HRAutonomy.tsx (HR control room)

- 19 onClick handlers; 16 button elements.
- Handlers: `handleApproveLeave`, `handleRejectLeave`, `handleHire`, `handleClockIn`, `handleCalcAllPayroll`, `handleAddCandidate`, `handleCompleteOnboardingItem`, etc. — all defined inline.
- D1 PASS.
- D2 PARTIAL: handlers call `HR.leaves.approveLeave(...)`, `HR.attendance.clockIn(...)`, `HR.hireFromRecruitment(...)`. These are local **state-machine adapters** (`features/hr/HR.ts`), updating snapshot via `setSnap(getHRSnapshot())`. **Not yet wired to backend `/api/hr/*` endpoints** — purely client state. **Finding**: server persistence missing for HR actions.
- D3 FAIL: No `confirm()` on `handleRejectLeave`, no confirm on `handleHire` (commits a salary/start-date). **Finding**: add destructive confirm.
- D4 FAIL: Handlers are synchronous client mutations, no loading. Acceptable for in-memory model, but once wired to API, must add.

### 3.3 IntelligentAlerts.tsx (Alert console)

- 12 onClick handlers.
- `handleAck`, `handleResolve`, `handleSnooze`, `handleAddNote` defined; call `safeAck/safeResolve/safeSnooze` from the IAS (Intelligent Alert Service) module.
- D1 PASS, D2 PARTIAL (in-memory IAS, surfaces `showToast`), D3 N/A (non-destructive), D4 FAIL (no async/disabled — acceptable for sync ops).

### 3.4 ProcurementHyperintelligence.tsx (40 handlers)

- Tab switching, sort, supplier/product CRUD, RFQ close, supplier disable.
- D1 PASS, D2 PASS (uses `api.*` for CRUD).
- D3 PASS for destructive ops: `confirm('להשבית את הספק…')`, `confirm('לסגור מכרז עכשיו?')`, `confirm('לסגור ככישלון?')`.
- D4 PARTIAL: 1 instance of `isPending`/`isSubmitting` found. Most CRUD has no disabled.

### 3.5 Purchasing.tsx (13 handlers)

- Product/material CRUD; D3 PASS (`confirm('למחוק את ${editing.name}?')`).
- D2 PASS via `api.*`. D4 FAIL: no disabled state on save/delete buttons.

### 3.6 Documents.tsx (23 handlers)

- File preview, upload, type filter, new-document modal triggers (`contract_client`, `contract_employee`, `nda`).
- D1 PASS, D2 PASS (uses upload endpoint), D3 N/A (no delete shown in primary path), D4 PARTIAL.

### 3.7 HoursAttendance.tsx, AbsenceApproval.tsx, VacationBalance.tsx

- HoursAttendance delete row: `if (!window.confirm('האם למחוק את הרישום?')) return;` — D3 PASS.
- AbsenceApproval bulk approve: `if (!confirm('לאשר ${selectedIds.size} בקשות?')) return;` — D3 PASS.
- VacationBalance monthly accrual: `if (!window.confirm('להוסיף צבירה חודשית ל-${visibleEmployees.length} עובדים?')) return;` — D3 PASS.

### 3.8 Tab-switching, sort, modal-open buttons

- ~120+ buttons are pure UI navigation (tab key, set view-mode, open modal). All D1 PASS, D2/D3/D4 N/A.

### 3.9 AdminPanel-equivalent: AdminPanel.tsx (payroll, but cross-app)

- `handleDeactivate`: `if (!window.confirm('האם לנטרל משתמש זה?')) return;` — D3 PASS.

---

## 4. Findings — PAYROLL_AUTONOMOUS / src

### 4.1 NotificationCenter.tsx (12 handlers)

- Uses **react-query** properly: `acknowledgeMutation`, `resolveMutation`, `reopenMutation`, `readMutation`, `readAllMutation`.
- Each mutation: `mutationFn: markNotificationRead`, `onSuccess: invalidateQueries`.
- D1 PASS. D2 PASS (real `markNotificationRead`/`acknowledgeNotification` API fns). D3 N/A. D4 PASS (mutation `isPending` available; not all buttons consume it visibly — minor finding).

### 4.2 NotificationCenter.jsx (legacy, 16 handlers) — **DUPLICATE**

- Coexists with `.tsx` version. **Finding**: dead/duplicate component; consolidate.

### 4.3 BankReconciliation.tsx (8 handlers)

- 3-step reconciliation wizard. Final `handleClose` button: `disabled={closing}` — D4 PASS.
- D3 missing on “התעלם” (ignore) — non-destructive, acceptable.

### 4.4 CashFlowForecast.tsx (3 handlers)

- Export, print, period picker. All D1 PASS, D2 PASS for export, D3 N/A, D4 N/A (synchronous).

### 4.5 BIDashboard.jsx (11 handlers)

- Drill-down handlers `onDrillDown(...)` plus period switch and export.
- D1 PASS (callback prop pattern). D2: PASS at parent. D3 N/A. D4 PARTIAL.

### 4.6 CustomerPortal.jsx (17 handlers)

- Invoice PDF, pay, contact save, address save: each uses `disabled={busy}` — **D4 PASS**.
- API calls via `axios` / `api.*`. D2 PASS.
- No destructive ops in this portal. D3 N/A.

### 4.7 AdminPanel.tsx, ExpenseSubmit.jsx, AdvancedAIAgentConsole.tsx

- Destructive: `handleDeactivate` — D3 PASS.
- ExpenseSubmit: file upload, OCR run, line add/remove, submit/export. `disabled={!draft.receipt_ref}` for OCR — D4 PARTIAL.

### 4.8 KioskClockIn.jsx, TicketList.jsx, TenantPortal.jsx, SupplierPortal.jsx

- Kiosk clock-in: 9 handlers. D1 PASS, D2 PASS (real `/api/attendance/clockin`), D4 PARTIAL.
- TicketList: 18 handlers. D2 PASS. D3 missing on “close ticket”.

### 4.9 Aggregate D4 coverage in payroll

- **58 instances of `disabled=`/`isPending`/`isSubmitting`** across 22 files. Coverage ~42% of mutation buttons.

---

## 5. Findings — ONYX_PROCUREMENT / web (legacy HTML pages)

### 5.1 customer360.html (15 onclick, 24 buttons)

- `actionCreateQuote`, `actionCreateProject`, `actionIssueInvoice` — **REAL** `fetch(API_BASE + '/api/quotes')`, `'/api/projects'`, `'/api/invoices')`. D1/D2 PASS.
- `actionSendMessage` and `actionUploadDoc` — **STUBS**: only `alert('פתיחת...')`. D2 FAIL.
- `actionBlockCustomer` — `confirm('...')` then `alert('הלקוח נחסם (דמו)')`. D3 PASS but D2 FAIL (stub).
- `loadCustomer()` retry button — D1/D2 PASS.
- D4: no disabled-while-loading; uses skeleton overlay instead. PARTIAL.

### 5.2 po360.html (20 onclick, 19 buttons)

- All actions go through `doAction(actionId)`:
  ```js
  function doAction(actionId){
    if(confirm('לבצע פעולה: '+labels[actionId]+'?')){
      alert('פעולה "..." נשלחה ל-Workflow Engine.\nPOST /api/orchestrator/execute ...');
    }
  }
  ```
  **D2 FAIL**: confirm-then-alert; no actual `fetch`. **Major finding**: PO360 buttons are placeholders.
- D3 PASS (confirm gate present for every action).
- D4 N/A (no async).
- Counted as STUBS: `request_approval, approve, reject, send, receive, register_invoice, close, export, edit, attach, cancel` (11 PO actions all stubs).

### 5.3 quote360.html (17 onclick, 14 buttons), rfq360.html (12, 11), supplier360.html (18, 31)

- Same `doAction` pattern as po360: **STUBS** with confirm + alert.
- **Finding**: legacy `web/*.html` 360 pages are skeletons; only `customer360.html` has 3 real fetch calls; the rest are demo confirm/alert.
- Total stub buttons across legacy HTML pages (excl customer360 real ones): **~70 STUBS**.

### 5.4 entity360.html, pipeline-dashboard.html, status.html

- entity360: 6 onclick, 3 buttons — navigation only. D2 N/A.
- pipeline-dashboard: 8 onclick — switch view. D2 N/A.
- status: 1 onclick — refresh. D2 N/A (calls `/api/status/health`).

### 5.5 *.jsx dashboards (onyx-dashboard, vat-, bank-, annual-tax-)

- 60 onClick across 4 React-component dashboards. Mostly tab and chart-drill. D2 PASS via fetch, D3/D4 N/A.

---

## 6. Aggregated scorecard

| Service | Total buttons audited | D1 Handler defined | D2 Real API | D3 Confirm if destructive | D4 Loading state |
|---|---:|---|---|---|---|
| TECHNO_KOL_OPS | 269 | 269 / 269 (100%) | ~250 / 269 (93%) | 8 destructive guards present, ~6 missing on HR/state-transitions | ~37 explicit `disabled` (covers ~60% of mutation buttons) |
| PAYROLL_AUTONOMOUS | 305 handlers | 305 / 305 (100%) | ~280 / 305 (92%) | 2 confirm() gates; ~5 destructive ops missing confirm (TicketList close, expense delete) | 58 `disabled`/isPending — ~42% mutation coverage |
| ONYX_PROCUREMENT web HTML | 97 onclick | 97 / 97 (100%) | **27 real / 70 STUBS (28%)** — only customer360 has real `fetch`; po360/quote360/rfq360/supplier360 are demo `confirm+alert` | 100% — all `doAction` paths confirm | N/A (no async stubs) |
| ONYX_PROCUREMENT web JSX | ~60 | 100% | ~85% | N/A | low |

---

## 7. Top findings (action items)

1. **CRITICAL — onyx-procurement/web/po360.html, quote360.html, rfq360.html, supplier360.html**:
   `doAction()` is a `confirm()+alert()` placeholder. ~70 buttons across 4 legacy 360 pages do **not** call any API. Wire to `POST /api/orchestrator/execute` (already exists per `pipeline/orchestrator.js`). High-impact: violates "No Dead Pages" rule in CLAUDE.md.

2. **HIGH — customer360.html**: `actionSendMessage` and `actionUploadDoc` are `alert()` stubs. Wire to `/api/messages` and `/api/documents/upload`.

3. **HIGH — techno-kol-ops/HRAutonomy.tsx**: HR actions (approve/reject leave, hire, payroll calc) update local snapshot only. **No `/api/hr/*` POST**. Add server persistence.

4. **MEDIUM — Destructive-confirm gaps**:
   - `WorkOrder360.transitionState('signed_off')` — irreversible, no confirm.
   - `Project360.transitionState('closed')` — irreversible, no confirm.
   - `HRAutonomy.handleRejectLeave` — has impact on employee, no confirm.
   - `HRAutonomy.handleHire` — commits salary/start, no confirm.
   - `TicketList.jsx` close — irreversible, no confirm.

5. **MEDIUM — Loading-state coverage**:
   - WorkOrder360/Project360 are exemplary (`disabled={!!actionLoading}` everywhere).
   - HRAutonomy, Purchasing, Materials, Schedule, Pipeline mutations lack `disabled`. Risk: double-submit.

6. **LOW — Duplicate component**: `payroll-autonomous/src/components/NotificationCenter.jsx` and `.tsx` coexist (16 vs 12 handlers). Consolidate.

7. **LOW — onyx-ai has no client**: matches `CLAUDE.md` (server-only at :3300). Confirmed; no buttons audit needed.

---

## 8. Patterns worth keeping

- `executeAction(actionId)` + `transitionState(state)` pattern in 360 pages → orchestrator endpoint. Reproducible across all 9 Master 360 pages.
- react-query `useMutation` in payroll's NotificationCenter.tsx — proper cache invalidation pattern.
- Customer360.html's real fetch + skeleton-while-loading flow.

## 9. Recommended next agents

- **Wire-stubs agent**: replace 70 `doAction` stubs in `web/*.html` with real `fetch /api/orchestrator/execute`.
- **Confirm-gate agent**: add `window.confirm` to the 5+ destructive transitions identified.
- **Loading-state agent**: add `disabled={pending}` to ~50 mutation buttons in techno-kol-ops/payroll.
- **HR backend agent**: build `/api/hr/leaves/approve`, `/api/hr/hire`, `/api/hr/payroll/calc` endpoints.

---
End of report.
