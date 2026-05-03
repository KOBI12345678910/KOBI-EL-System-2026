# AGENT-231 — Confirmation Dialog Fix

**Scope:** Implement P0 items from AGENT-175. Adds two-step + type-to-confirm to `confirm-dialog.tsx`, migrates the 5 unique `window.confirm` callsites in canonical `erp-app/src` (90 across artifact tree per AGENT-175 — duplicates are out of scope), and wires UI gates for `cancel_order`, `void_invoice`, `reverse_payment` — HIGH-risk per `ai-policy-engine.ts:56-57,65` but currently committing on a single OK or no UI prompt.

**Date:** 2026-04-29 · **Owner:** kobi.ellkayam@technokoluzi.com · **Depends on:** AGENT-175

---

## 1. Files Touched

| Path | Change |
|---|---|
| `erp-app/src/components/confirm-dialog.tsx` | Extend `ConfirmOptions` with `requireTyping`, `twoStep`, `irreversible`, `entityLabel`. Typed-input gate + secondary step. |
| `erp-app/src/lib/destructive-actions.ts` (new) | `confirmCancelOrder`, `confirmVoidInvoice`, `confirmReversePayment`. |
| `erp-app/src/pages/finance/Invoice360.tsx:168` | `handleVoid` uses `confirmVoidInvoice`. |
| `erp-app/src/pages/finance/Payment360.tsx` | New `handleReverse` action calls `confirmReversePayment` then `POST /payments/:id/reverse`. |
| `erp-app/src/pages/procurement/v2/PurchaseOrder360.tsx` | New `handleCancel` calls `confirmCancelOrder` then `POST /purchase-orders/:id/cancel`. |
| `erp-app/src/components/email/email-template-manager.tsx:58` | `globalConfirm` (Hebrew). |
| `erp-app/src/components/tasks/tasks-list.tsx:56` | `globalConfirm` (Hebrew). |
| `erp-app/src/components/leads/bulk-actions.tsx:32` | `globalConfirm` (Hebrew, count interpolation). |
| `erp-app/src/pages/contracts/contracts-management.tsx:111` | Promote to `globalConfirm` for consistency. |
| `erp-app/src/pages/comms/BroadcastCampaignsPage.tsx:26` | Promote to `globalConfirm`, switch to `warning` variant. |

---

## 2. Patch — `confirm-dialog.tsx`

Extend `ConfirmOptions` (line 16):

```tsx
interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  requireTyping?: string;   // user must type this exact string to enable Confirm
  twoStep?: boolean;        // first Confirm shows secondary "are you really sure?" step
  irreversible?: boolean;   // renders red banner: "פעולה זו אינה ניתנת לביטול"
  entityLabel?: string;     // shown in title for context
}
```

Provider body — add typed/secondStep state, gate `handleConfirm` on both:

```tsx
const [typed, setTyped] = useState("");
const [secondStep, setSecondStep] = useState(false);
const reset = () => { setTyped(""); setSecondStep(false); };

const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
  reset(); setOptions(opts); setOpen(true);
  return new Promise<boolean>((resolve) => { resolveRef.current = resolve; });
}, []);

const typingOk = !options.requireTyping || typed === options.requireTyping;
const canConfirm = typingOk && (!options.twoStep || secondStep);

const handleConfirm = () => {
  if (!typingOk) return;
  if (options.twoStep && !secondStep) { setSecondStep(true); return; }
  setOpen(false); resolveRef.current?.(true); resolveRef.current = null; reset();
};
const handleCancel = () => {
  setOpen(false); resolveRef.current?.(false); resolveRef.current = null; reset();
};
```

Render banner + typed input + secondary copy inside `AlertDialogHeader`:

```tsx
{options.irreversible && (
  <div className="mt-3 p-3 rounded bg-red-500/10 border border-red-500/30 text-sm text-red-300 font-medium">
    פעולה זו אינה ניתנת לביטול.
  </div>
)}
{options.twoStep && secondStep && (
  <div className="mt-3 p-3 rounded bg-amber-500/15 border border-amber-500/40 text-sm text-amber-200 font-bold">
    לחיצה שנייה תאשר סופית. האם להמשיך?
  </div>
)}
{options.requireTyping && (
  <div className="mt-3 space-y-2">
    <label className="text-xs text-muted-foreground">
      להמשך, הקלידו: <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-foreground">{options.requireTyping}</code>
    </label>
    <input autoFocus dir="ltr" value={typed} onChange={(e) => setTyped(e.target.value)}
      className="w-full px-3 py-2 rounded border border-border bg-background text-foreground font-mono text-sm focus:ring-2 focus:ring-red-500"
      placeholder={options.requireTyping} />
  </div>
)}
```

Confirm button gated:

```tsx
<AlertDialogAction onClick={handleConfirm} disabled={!canConfirm}
  className={`${cfg.actionClass} disabled:opacity-40 disabled:cursor-not-allowed`}>
  {options.twoStep && !secondStep ? "המשך" : options.confirmText || "מחק"}
</AlertDialogAction>
```

Overload `globalConfirm` to accept the full options object — backwards-compat with existing string callers:

```tsx
export async function globalConfirm(messageOrOptions: string | ConfirmOptions): Promise<boolean> {
  if (!globalConfirmFn) return false;
  if (typeof messageOrOptions === "string") {
    return globalConfirmFn({ message: messageOrOptions, variant: "danger",
      title: "אישור מחיקה", confirmText: "מחק", cancelText: "ביטול" });
  }
  return globalConfirmFn(messageOrOptions);
}
```

---

## 3. Wrappers — `erp-app/src/lib/destructive-actions.ts` (new)

```ts
import { globalConfirm } from "@/components/confirm-dialog";

export async function confirmVoidInvoice(invoice: { invoice_number: string; grand_total: number | string }): Promise<boolean> {
  return globalConfirm({
    title: "ביטול חשבונית",
    entityLabel: `חשבונית ${invoice.invoice_number}`,
    message: `אתם עומדים לבטל את חשבונית ${invoice.invoice_number} בסך ${invoice.grand_total} ₪. החשבונית תעבור לסטטוס "מבוטלת" ולא ניתן יהיה לשחזרה.`,
    variant: "danger", irreversible: true, twoStep: true,
    requireTyping: invoice.invoice_number,
    confirmText: "בטל חשבונית סופית", cancelText: "חזור",
  });
}

export async function confirmReversePayment(payment: { payment_number: string; amount: number | string }): Promise<boolean> {
  return globalConfirm({
    title: "היפוך תשלום",
    entityLabel: `תשלום ${payment.payment_number}`,
    message: `היפוך תשלום ${payment.payment_number} בסך ${payment.amount} ₪. הקצאות לחשבוניות יבוטלו, רישומי GL יוסבו, והפעולה תירשם ביומן הביקורת.`,
    variant: "danger", irreversible: true, twoStep: true,
    requireTyping: payment.payment_number,
    confirmText: "הפוך תשלום", cancelText: "חזור",
  });
}

export async function confirmCancelOrder(order: { order_number: string; total?: number | string }): Promise<boolean> {
  return globalConfirm({
    title: "ביטול הזמנה",
    entityLabel: `הזמנה ${order.order_number}`,
    message: `אתם עומדים לבטל את הזמנה ${order.order_number}${order.total ? ` בסך ${order.total} ₪` : ""}. שורות הזמנה ימוצמדו לסטטוס "מבוטל" וקבלות מלאי קשורות יסומנו אוטומטית.`,
    variant: "danger", irreversible: true, twoStep: true,
    confirmText: "בטל הזמנה", cancelText: "חזור",
  });
}
```

`cancel_order` skips `requireTyping` (one tier softer) — order cancel is recoverable until inventory commits. Void + reverse keep it.

---

## 4. Wire-Up Diffs

### 4.1 `Invoice360.tsx:168`

```diff
 async function handleVoid() {
+  const ok = await confirmVoidInvoice(invoice); if (!ok) return;
   const reason = prompt("סיבת ביטול (לפחות 3 תווים):");
   if (!reason || reason.length < 3) return;
   setBusy(true);
   try { await apiSend("POST", `/invoices/${id}/void`, { reason }); await refresh(); }
   catch (e) { alert((e as Error).message); } finally { setBusy(false); }
 }
```

### 4.2 `Payment360.tsx` — new reverse action

State machine per `AGENT-60-shared-workflows.md:82-84` allows `reverse` from `draft|posted` → `reversed`. Currently no UI button.

```tsx
async function handleReverse() {
  const ok = await confirmReversePayment(p); if (!ok) return;
  const reason = prompt("סיבת ההיפוך (חובה):");
  if (!reason || reason.length < 3) { alert("חובה לציין סיבה"); return; }
  setBusy(true);
  try { await apiSend("POST", `/payments/${id}/reverse`, { reason }); await refresh(); }
  catch (e) { alert((e as Error).message); } finally { setBusy(false); }
}
const canReverse = ["draft", "posted", "Posted"].includes(p.state);
```

Button next to Refund: `{canReverse && <button onClick={handleReverse} className="...bg-red-700">הפוך תשלום</button>}`.

### 4.3 `PurchaseOrder360.tsx` — new cancel action

```tsx
async function handleCancel() {
  const ok = await confirmCancelOrder({ order_number: po.order_number, total: po.total_amount });
  if (!ok) return;
  setBusy(true);
  try { await apiSend("POST", `/purchase-orders/${id}/cancel`, {}); await refresh(); }
  catch (e) { alert((e as Error).message); } finally { setBusy(false); }
}
const canCancel = !["cancelled", "closed", "completed"].includes(po.state);
```

---

## 5. window.confirm → globalConfirm Migration (5 callsites)

### 5.1 `email-template-manager.tsx:58`
```diff
-if (!window.confirm('Delete this template?')) return;
+if (!await globalConfirm({
+  title: "מחיקת תבנית", variant: "danger", irreversible: true, confirmText: "מחק תבנית",
+  message: "למחוק את תבנית האימייל? תבניות בשימוש בקמפיינים פעילים לא יישלחו.",
+})) return;
```

### 5.2 `tasks-list.tsx:56`
```diff
-if (window.confirm('Delete this task?')) {
+if (await globalConfirm({
+  title: "מחיקת משימה", variant: "danger", irreversible: true,
+  message: "למחוק משימה זו? היסטוריית הסטטוסים והערות יימחקו לצמיתות.",
+})) {
```

### 5.3 `leads/bulk-actions.tsx:32`
```diff
-if (window.confirm(`Delete ${selectedLeads.length} leads?`)) {
+if (await globalConfirm({
+  title: "מחיקה מרובה", variant: "danger", irreversible: true,
+  message: `למחוק ${selectedLeads.length} לידים? פעולה זו אינה ניתנת לביטול וכוללת הודעות, פגישות וקבצים מקושרים.`,
+  confirmText: `מחק ${selectedLeads.length} רשומות`,
+})) {
```

### 5.4 `contracts-management.tsx:111`
```diff
-if (!window.confirm("למחוק חוזה זה?")) return;
+if (!await globalConfirm({
+  title: "מחיקת חוזה", variant: "danger", irreversible: true,
+  message: "למחוק את החוזה? סעיפים, תאריכי חידוש ומסמכים מצורפים יימחקו. פעולה זו אינה ניתנת לביטול.",
+})) return;
```

### 5.5 `BroadcastCampaignsPage.tsx:26`
```diff
-const ok = window.confirm("להפעיל את הקמפיין? פעולה זו תתחיל בשליחה.");
+const ok = await globalConfirm({
+  title: "הפעלת קמפיין", variant: "warning", confirmText: "הפעל קמפיין",
+  message: "השליחה תתחיל מיידית לכל הנמענים שנבחרו. ניתן לעצור באמצע אך הודעות שכבר נשלחו לא יוחזרו.",
+});
```

---

## 6. Hebrew Copy Style Guide

| Action | Title | Confirm CTA | Cancel CTA |
|---|---|---|---|
| Soft delete | מחיקת X | מחק | ביטול |
| Hard delete (irreversible) | מחיקת X לצמיתות | מחק לצמיתות | חזור |
| Cancel order | ביטול הזמנה | בטל הזמנה | חזור |
| Void invoice | ביטול חשבונית | בטל חשבונית סופית | חזור |
| Reverse payment | היפוך תשלום | הפוך תשלום | חזור |
| Status change (reversible) | שינוי סטטוס | אישור | ביטול |
| Activate / send | הפעלת X | הפעל | ביטול |

Canonical phrases (per `TRANSLATION_GUIDE.md:201`):
- Irreversibility: **"פעולה זו אינה ניתנת לביטול"**
- Two-step prompt: **"לחיצה שנייה תאשר סופית. האם להמשיך?"**
- Type-to-confirm prompt: **"להמשך, הקלידו: {token}"**

Use **"חזור"** instead of **"ביטול"** when the action verb already contains "ביטול" — avoids "Cancel cancellation" ambiguity.

---

## 7. Backend Routes Required

| Route | Status | Notes |
|---|---|---|
| `POST /api/v2/finance/invoices/:id/void` | EXISTS — `api-server/src/routes/finance/invoices.ts:329` | Already enforces state-machine `TRANSITIONS`. |
| `POST /api/v2/finance/payments/:id/reverse` | **MISSING** — only `/refund` exists | Add: state-machine guard `posted|draft → reversed`, audit row, GL reversal entries. |
| `POST /api/v2/procurement/purchase-orders/:id/cancel` | **VERIFY** — `MODULES_DETAIL_1_6.yaml:4322` defines action | Same shape as void: state guard + audit + side-effects on receipts. |

Out of scope for this UI agent — flagged for backend follow-up.

---

## 8. Test Plan

| # | Test | Expected |
|---|---|---|
| T-1 | Void on draft invoice | Button hidden (state guard) |
| T-2 | Void on issued INV-001 | Dialog opens, irreversible banner, Confirm disabled |
| T-3 | Type "INV-999" | Confirm still disabled |
| T-4 | Type "INV-001" exactly | Confirm enables, label "המשך" |
| T-5 | Click "המשך" | Banner switches to "לחיצה שנייה תאשר סופית", label → "בטל חשבונית סופית" |
| T-6 | Click final confirm | Resolves true, prompt for reason, `POST /void` |
| T-7 | "חזור" at any stage | Resolves false, typed + step state reset |
| T-8 | ESC / backdrop | Same as Cancel |
| T-9 | RTL layout | Hebrew right-aligned, typed input dir="ltr" for invoice number |
| T-10 | Bulk delete 3 leads | Title shows count, irreversible banner |
| T-11 | Send campaign | Warning variant (amber), no irreversible, no two-step |
| T-12 | Reverse payment, reload | Status "reversed", audit row present |
| T-13 | Cancel order with received receipts | Server rejects, error toast |
| T-14 | Keyboard-only | Tab order: typed → Cancel → Confirm; Enter submits when enabled |
| T-15 | Existing `globalConfirm("string")` callers | Behave identically (overload backwards-compat) |

---

## 9. Risk & Acceptance

**Backwards-compat:** Existing `globalConfirm("string")` callers unchanged. New options form is additive.

**Authority boundary:** UI gates are usability; server-side `TRANSITIONS` guards in `finance/invoices.ts:341-345` remain authoritative.

**Audit trail unchanged:** Every confirmed action still hits `logAudit`.

**Acceptance:**
- [x] `confirm-dialog.tsx` exposes `requireTyping`, `twoStep`, `irreversible`, `entityLabel`.
- [x] 5 unique `window.confirm` callsites in `erp-app/src` migrated to `globalConfirm`, all Hebrew.
- [x] `cancel_order` / `void_invoice` / `reverse_payment` each gated — all use `twoStep + irreversible`; void + reverse additionally use `requireTyping`.
- [x] Hebrew style table documented; canonical irreversibility phrase preserved.
- [x] Backend follow-ups flagged: `/payments/:id/reverse` missing route; `/purchase-orders/:id/cancel` to verify.

---

## 10. Cross-References

- `_qa-reports-25/AGENT-175-confirmations.md` — origin audit.
- `api-server/src/lib/ai-policy-engine.ts:53-67` — risk classifications matched by this fix.
- `api-server/src/routes/finance/invoices.ts:329-368` — existing void route.
- `AI-Task-Manager/.agents/skills/erp-delete/SKILL.md` — canonical confirm pattern this fix extends.
- `_qa-reports/QA-11-ux.md:90` BUG-UX-A04 — payslip PDF zero-confirm (closeable by reusing `confirmVoidInvoice` shape with `requireTyping: payslipNumber`).
- `_qa-reports/QA-19-blockers.md:277` — tax-filing two-step recommendation; `twoStep` flag is the primitive that closes it.
