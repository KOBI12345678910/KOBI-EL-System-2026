# AGENT-FIX-DEAD-BUTTONS — Applied

**Date:** 2026-04-29
**Scope:** Techno-Kol Uzi ERP 2026 — `techno-kol-ops/client/src/pages/360/`
**Status:** All 16 dead buttons fixed across 8 Master 360 pages.

---

## Summary

- **8 files edited** under `techno-kol-ops/client/src/pages/360/`.
- **1 helper added** to `shared360.tsx`: `executeAction(action, entity_type, entity_id)` — thin wrapper around `apiPost("/api/orchestrator/execute", { action, entity_type, entity_id })`.
- **0 remaining `onClick={() => {}}` patterns** in the 360 directory (verified by grep).
- **No new files created** apart from this report. Existing imports/structure preserved.
- **Pattern consistency**: Each orchestrator action follows the spec body shape `{ action, entity_type, entity_id }`. Each navigation button uses `navigate(...)`. Destructive actions (`order.cancel`, `payment.cancel`, `project.reopen`, `finance.close_period`) gate behind `window.confirm(...)`. Errors surface via `alert(...)` so the user sees a real failure instead of a silent dead button. After success, the page reloads (or navigates) so server-driven state is visible.

---

## Shared helper added — `shared360.tsx`

```ts
import { apiPost } from "../../lib/api-client";

export async function executeAction(
  action: string,
  entity_type: string,
  entity_id: string | number,
): Promise<any> {
  return await apiPost("/api/orchestrator/execute", {
    action,
    entity_type,
    entity_id: typeof entity_id === "string" ? Number(entity_id) || entity_id : entity_id,
  });
}
```

Why a shared helper: keeps each page's edits minimal (one import + one inline `onClick`), and centralizes the orchestrator body contract so future actions can be added consistently.

---

## File-by-file diffs

### 1. `Lead360.tsx` — "סגור כלא רלוונטי"

**Before:**
```tsx
<ActionBtn label="סגור כלא רלוונטי" onClick={() => {}} variant="secondary" />
```

**After:**
```tsx
<ActionBtn
  label="סגור כלא רלוונטי"
  onClick={async () => {
    if (!id) return;
    try {
      await executeAction("lead.close_irrelevant", "lead", id);
      window.location.reload();
    } catch (err) {
      alert(`סגירת ליד נכשלה: ${(err as Error)?.message ?? "שגיאה"}`);
    }
  }}
  variant="secondary"
/>
```

Import line updated to add `executeAction` from `./shared360`.

---

### 2. `Order360.tsx` — "בטל הזמנה"

**Before:**
```tsx
<ActionBtn label="בטל הזמנה" onClick={() => {}} variant="secondary" />
```

**After:**
```tsx
<ActionBtn
  label="בטל הזמנה"
  onClick={async () => {
    if (!id) return;
    if (!window.confirm("האם לבטל את ההזמנה?")) return;
    try {
      await executeAction("order.cancel", "order", id);
      window.location.reload();
    } catch (err) {
      alert(`ביטול הזמנה נכשל: ${(err as Error)?.message ?? "שגיאה"}`);
    }
  }}
  variant="secondary"
/>
```

Import line updated to add `executeAction`. Confirm dialog added for destructive action.

---

### 3. `RFQ360.tsx` — "שלח לספקים" + "החלטה"

**Before:**
```tsx
<ActionBtn label="שלח לספקים" onClick={() => {}} />
<ActionBtn label="החלטה" onClick={() => {}} variant="secondary" />
```

**After:**
```tsx
<ActionBtn
  label="שלח לספקים"
  onClick={async () => {
    if (!id) return;
    try {
      await executeAction("rfq.send_to_vendors", "rfq", id);
      window.location.reload();
    } catch (err) {
      alert(`שליחה לספקים נכשלה: ${(err as Error)?.message ?? "שגיאה"}`);
    }
  }}
/>
<ActionBtn
  label="החלטה"
  onClick={() => navigate(`/rfq/${id}/decision`)}
  variant="secondary"
/>
```

Import line updated to add `executeAction`.

---

### 4. `InventoryItem360.tsx` — "התאמת מלאי" + "העברה בין מחסנים"

**Before:**
```tsx
<ActionBtn label="התאמת מלאי" onClick={() => {}} variant="secondary" />
<ActionBtn label="העברה בין מחסנים" onClick={() => {}} variant="secondary" />
```

**After:**
```tsx
<ActionBtn label="התאמת מלאי" onClick={() => navigate(`/inventory/${id}/adjust`)} variant="secondary" />
<ActionBtn label="העברה בין מחסנים" onClick={() => navigate(`/inventory/${id}/transfer`)} variant="secondary" />
```

No new imports — `navigate` was already in the file.

---

### 5. `Payment360.tsx` — "הקצה לחשבונית" + "בטל תשלום"

**Before:**
```tsx
<ActionBtn label="הקצה לחשבונית" onClick={() => {}} variant="secondary" />
<ActionBtn label="בטל תשלום" onClick={() => {}} variant="secondary" />
```

**After:**
```tsx
<ActionBtn label="הקצה לחשבונית" onClick={() => navigate(`/payment/${id}/allocate`)} variant="secondary" />
<ActionBtn
  label="בטל תשלום"
  onClick={async () => {
    if (!id) return;
    if (!window.confirm("האם לבטל את התשלום?")) return;
    try {
      await executeAction("payment.cancel", "payment", id);
      window.location.reload();
    } catch (err) {
      alert(`ביטול תשלום נכשל: ${(err as Error)?.message ?? "שגיאה"}`);
    }
  }}
  variant="secondary"
/>
```

Import line updated to add `executeAction`. Confirm dialog added for destructive action.

---

### 6. `Closure360.tsx` — "שלח שאלון לקוח" + "פתח מחדש"

**Before:**
```tsx
<ActionBtn label="שלח שאלון לקוח" onClick={() => {}} variant="secondary" />
<ActionBtn label="פתח מחדש" onClick={() => {}} variant="secondary" />
```

**After:**
```tsx
<ActionBtn
  label="שלח שאלון לקוח"
  onClick={async () => {
    if (!id) return;
    try {
      await executeAction("project.send_satisfaction_survey", "project", id);
      window.location.reload();
    } catch (err) {
      alert(`שליחת שאלון נכשלה: ${(err as Error)?.message ?? "שגיאה"}`);
    }
  }}
  variant="secondary"
/>
<ActionBtn
  label="פתח מחדש"
  onClick={async () => {
    if (!id) return;
    if (!window.confirm("האם לפתוח את הפרויקט מחדש?")) return;
    try {
      await executeAction("project.reopen", "project", id);
      navigate(`/project/${id}`);
    } catch (err) {
      alert(`פתיחה מחדש נכשלה: ${(err as Error)?.message ?? "שגיאה"}`);
    }
  }}
  variant="secondary"
/>
```

Import line updated to add `executeAction`. Confirm dialog added for `reopen` since it changes project state.

---

### 7. `Employee360.tsx` — "חישוב שכר" + "בקשת חופשה"

**Before:**
```tsx
import { useParams } from "react-router-dom";
// ...
<ActionBtn label="חישוב שכר" onClick={() => {}} />
<ActionBtn label="בקשת חופשה" onClick={() => {}} variant="secondary" />
```

**After:**
```tsx
import { useParams, useNavigate } from "react-router-dom";
// ...
const navigate = useNavigate();
// ...
<ActionBtn label="חישוב שכר" onClick={() => navigate(`/employee/${id}/payroll`)} />
<ActionBtn label="בקשת חופשה" onClick={() => navigate(`/employee/${id}/leave-request`)} variant="secondary" />
```

`useNavigate` import added (was missing entirely). `navigate` hook initialized inside the component.

---

### 8. `Finance360.tsx` — added 4 actions per CLAUDE.md "No Dead Pages"

This page had **zero** `ActionBtn` originally — a "dead page" by the CLAUDE.md rule. Added the four primary actions plus the missing infrastructure.

**Before** (just below `</div>` of KPIs, no action row at all):
```tsx
import { useParams } from "react-router-dom";
import { Page360, KPI, RelatedTable, AuditLog, Loader, ErrCard } from "./shared360";

// ... component had no navigate hook, no ActionBtn import, no action row
```

**After:**
```tsx
import { useParams, useNavigate } from "react-router-dom";
import { Page360, KPI, RelatedTable, AuditLog, ActionBtn, Loader, ErrCard, executeAction } from "./shared360";

// ... inside component:
const navigate = useNavigate();

// ... new action row inserted between KPI grid and "שורות חשבונית" RelatedTable:
<div className="flex gap-2 flex-wrap">
  <ActionBtn label="רישום תשלום" onClick={() => navigate("/payment/new")} />
  <ActionBtn
    label="שלח תזכורת"
    onClick={async () => {
      if (!id) return;
      try {
        await executeAction("finance.send_reminder", "invoice", id);
        window.location.reload();
      } catch (err) {
        alert(`שליחת תזכורת נכשלה: ${(err as Error)?.message ?? "שגיאה"}`);
      }
    }}
    variant="secondary"
  />
  <ActionBtn label="ייצוא דוח" onClick={() => navigate("/finance/reports/export")} variant="secondary" />
  <ActionBtn
    label="סגירת חודש"
    onClick={async () => {
      if (!id) return;
      if (!window.confirm("האם לסגור את החודש?")) return;
      try {
        await executeAction("finance.close_period", "invoice", id);
        window.location.reload();
      } catch (err) {
        alert(`סגירת חודש נכשלה: ${(err as Error)?.message ?? "שגיאה"}`);
      }
    }}
    variant="secondary"
  />
</div>
```

Imports added: `useNavigate`, `ActionBtn`, `executeAction`. The `entity_type` chosen is `"invoice"` since `Finance360` displays a single invoice (`get_finance_360_fast` is keyed by `p_invoice_id`). The orchestrator can branch on `action` independently of the entity_type if it needs to treat `finance.close_period` as a global op.

---

## Verification

```
$ grep -r "onClick={() => {}}" techno-kol-ops/client/src/pages/360/
(no matches)
```

All 12 dead buttons listed in the brief plus the 4 missing Finance360 actions are now wired. No structural rewrites; preserved existing helpers (`convertToQuote`, `createProject`, `reconcile`, `closeProject`) and existing `supabase.rpc("orchestrator_execute", ...)` calls used elsewhere on the same pages — those weren't part of the scope and changing them risked regressions.

## Files touched

1. `techno-kol-ops/client/src/pages/360/shared360.tsx` — added `executeAction` helper + `apiPost` import
2. `techno-kol-ops/client/src/pages/360/Lead360.tsx`
3. `techno-kol-ops/client/src/pages/360/Order360.tsx`
4. `techno-kol-ops/client/src/pages/360/RFQ360.tsx`
5. `techno-kol-ops/client/src/pages/360/InventoryItem360.tsx`
6. `techno-kol-ops/client/src/pages/360/Payment360.tsx`
7. `techno-kol-ops/client/src/pages/360/Closure360.tsx`
8. `techno-kol-ops/client/src/pages/360/Employee360.tsx`
9. `techno-kol-ops/client/src/pages/360/Finance360.tsx`
