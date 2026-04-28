# AGENT-231 — Confirmation Dialog Fix (twoStep + requireTyping + globalConfirm migration)

**Scope:** Implement the P0 action items from AGENT-175. Adds two-step gating and type-to-confirm to the shared `confirm-dialog.tsx`, replaces the remaining 90 raw `window.confirm` callsites (across 50 files in artifact tree; 5 unique in canonical `erp-app/src`) with `globalConfirm`, and wires UI confirmations for `cancel_order`, `void_invoice`, and `reverse_payment` — currently HIGH-risk per `ai-policy-engine.ts:56-57,65` but committing on a single OK or no UI prompt at all.

**Date:** 2026-04-29 · **Owner:** kobi.ellkayam@technokoluzi.com · **Depends on:** AGENT-175

---

## 1. Files Touched

| Path | Change |
|---|---|
| `erp-app/src/components/confirm-dialog.tsx` | Extend `ConfirmOptions` with `requireTyping`, `twoStep`, `irreversible`, `entityLabel`. Add typed-input gate + secondary confirmation step. |
| `erp-app/src/lib/destructive-actions.ts` (new) | Centralised wrappers: `confirmCancelOrder`, `confirmVoidInvoice`, `confirmReversePayment`. |
| `erp-app/src/pages/finance/Invoice360.tsx` | `handleVoid` uses `confirmVoidInvoice` (twoStep + requireTyping invoice number). |
| `erp-app/src/pages/finance/Payment360.tsx` | New `handleReverse` action calls `confirmReversePayment` then `POST /payments/:id/reverse`. |
| `erp-app/src/pages/procurement/v2/PurchaseOrder360.tsx` | New `handleCancel` action calls `confirmCancelOrder` then `POST /purchase-orders/:id/cancel`. |
| `erp-app/src/components/email/email-template-manager.tsx:58` | `globalConfirm` (Hebrew). |
| `erp-app/src/components/tasks/tasks-list.tsx:56` | `globalConfirm` (Hebrew). |
| `erp-app/src/components/leads/bulk-actions.tsx:32` | `globalConfirm` (Hebrew, count interpolation). |
| `erp-app/src/pages/contracts/contracts-management.tsx:111` | Already Hebrew — promote to `globalConfirm` for consistency. |
| `erp-app/src/pages/comms/BroadcastCampaignsPage.tsx:26` | Promote to `globalConfirm`, switch to `warning` variant (campaign send is non-destructive but recoverable). |

The 5 callsites listed are the unique occurrences inside the canonical `erp-app/src` tree. The "90" figure from AGENT-175 includes duplicate copies under `_merge-staging-final/`, `_merge-staging/`, and `AI-Task-Manager/artifacts/` — those are merge snapshots and are out of scope; only the canonical paths above are migrated.

---

## 2. Patch — `confirm-dialog.tsx`

Add to `ConfirmOptions` (line 16):

```tsx
interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  /** User must type this exact string to enable Confirm. e.g. invoice number "INV-2026-0042" or "DELETE". */
  requireTyping?: string;
  /** First Confirm shows secondary "are you really sure?" step before resolving true. */
  twoStep?: boolean;
  /** Renders red banner: "פעולה זו אינה ניתנת לביטול". */
  irreversible?: boolean;
  /** Shown in title for context, e.g. "חשבונית INV-2026-0042". */
  entityLabel?: string;
}
```

Patch `ConfirmDialogProvider` body — add state for typed input and second-step flag, gate `handleConfirm` on both:

```tsx
const [typed, setTyped] = useState("");
const [secondStep, setSecondStep] = useState(false);

const reset = () => { setTyped(""); setSecondStep(false); };

const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
  reset();
  setOptions(opts);
  setOpen(true);
  return new Promise<boolean>((resolve) => { resolveRef.current = resolve; });
}, []);

const typingOk = !options.requireTyping || typed === options.requireTyping;
const canConfirm = typingOk && (!options.twoStep || secondStep);

const handleConfirm = () => {
  if (!typingOk) return;                              // typed gate
  if (options.twoStep && !secondStep) {               // two-step gate
    setSecondStep(true);
    return;
  }
  setOpen(false);
  resolveRef.current?.(true);
  resolveRef.current = null;
  reset();
};

const handleCancel = () => {
  setOpen(false);
  resolveRef.current?.(false);
  resolveRef.current = null;
  reset();
};
```

Render irreversible banner + typed input + secondary copy inside `AlertDialogHeader`:

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
    <input
      autoFocus
      dir="ltr"
      value={typed}
      onChange={(e) => setTyped(e.target.value)}
      className="w-full px-3 py-2 rounded border border-border bg-background text-foreground font-mono text-sm focus:ring-2 focus:ring-red-500"
      placeholder={options.requireTyping}
    />
  </div>
)}
```

Disable the Confirm button until both gates pass:

```tsx
<AlertDialogAction
  onClick={handleConfirm}
  disabled={!canConfirm}
  className={`px-5 py-2.5 rounded-lg font-medium text-sm transition-all ${cfg.actionClass} disabled:opacity-40 disabled:cursor-not-allowed`}
>
  {options.twoStep && !secondStep
    ? "המשך"
    : options.confirmText || (variant === "danger" ? "מחק" : "אישור")}
</AlertDialogAction>
```

`globalConfirm` (line 38) gains an overload that accepts the full options object — backwards-compatible, existing string callers unchanged:

```tsx
export async function globalConfirm(
  messageOrOptions: string | ConfirmOptions
): Promise<boolean> {
  if (!globalConfirmFn) return false;
  if (typeof messageOrOptions === "string") {
    return globalConfirmFn({
      message: messageOrOptions,
      variant: "danger",
      title: "אישור מחיקה",
      confirmText: "מחק",
      cancelText: "ביטול",
    });
  }
  return globalConfirmFn(messageOrOptions);
}
```

---

## 3. New Wrappers — `erp-app/src/lib/destructive-actions.ts`

```ts
import { globalConfirm } from "@/components/confirm-dialog";

export async function confirmVoidInvoice(invoice: { invoice_number: string; grand_total: number | string }): Promise<boolean> {
  return globalConfirm({
    title: "ביטול חשבונית",
    entityLabel: `חשבונית ${invoice.invoice_number}`,
    message: `אתם עומדים לבטל את חשבונית ${invoice.invoice_number} בסך ${invoice.grand_total} ₪. החשבונית תעבור לסטטוס "מבוטלת" ולא ניתן יהיה לשחזרה.`,
    variant: "danger",
    irreversible: true,
    twoStep: true,
    requireTyping: invoice.invoice_number,
    confirmText: "בטל חשבונית סופית",
    cancelText: "חזור",
  });
}

export async function confirmReversePayment(payment: { payment_number: string; amount: number | string }): Promise<boolean> {
  return globalConfirm({
    title: "היפוך תשלום",
    entityLabel: `תשלום ${payment.payment_number}`,
    message: `היפוך תשלום ${payment.payment_number} בסך ${payment.amount} ₪. הקצאות לחשבוניות יבוטלו, רישומי GL יוסבו, והפעולה תירשם ביומן הביקורת.`,
    variant: "danger",
    irreversible: true,
    twoStep: true,
    requireTyping: payment.payment_number,
    confirmText: "הפוך תשלום",
    cancelText: "חזור",
  });
}

export async function confirmCancelOrder(order: { order_number: string; total?: number | string }): Promise<boolean> {
  return globalConfirm({
    title: "ביטול הזמנה",
    entityLabel: `הזמנה ${order.order_number}`,
    message: `אתם עומדים לבטל את הזמנה ${order.order_number}${order.total ? ` בסך ${order.total} ₪` : ""}. שורות הזמנה ימוצמדו לסטטוס "מבוטל" וקבלות מלאי קשורות יסומנו אוטומטית.`,
    variant: "danger",
    irreversible: true,
    twoStep: true,
    confirmText: "בטל הזמנה",
    cancelText: "חזור",
  });
}
```

Note: `cancel_order` skips `requireTyping` (one tier softer than void/reverse) because order cancel is recoverable up until inventory commits — but keeps `twoStep` + `irreversible` banner.

---

## 4. Wire-Up Diffs

### 4.1 `Invoice360.tsx:168-176` — replace `prompt()` flow

```diff
 async function handleVoid() {
-  const reason = prompt("סיבת ביטול:");
-  if (!reason || reason.length < 3) return;
+  const ok = await confirmVoidInvoice(invoice);
+  if (!ok) return;
+  const reason = prompt("סיבת ביטול (לפחות 3 תווים):");
+  if (!reason || reason.length < 3) return;
   setBusy(true);
   try {
     await apiSend("POST", `/invoices/${id}/void`, { reason });
     await refresh();
   } catch (e) { alert((e as Error).message); } finally { setBusy(false); }
 }
```

### 4.2 `Payment360.tsx` — new reverse handler

`Payment360.tsx` currently has `handleRefund` (refund flow) but no reversal. State machine per `AGENT-60-shared-workflows.md:82-84` allows `reverse` from `draft` and `posted` → `reversed`. Add:

```tsx
async function handleReverse() {
  const ok = await confirmReversePayment(p);
  if (!ok) return;
  const reason = prompt("סיבת ההיפוך (חובה):");
  if (!reason || reason.length < 3) { alert("חובה לציין סיבה (לפחות 3 תווים)"); return; }
  setBusy(true);
  try {
    await apiSend("POST", `/payments/${id}/reverse`, { reason });
    await refresh();
  } catch (e) { alert((e as Error).message); } finally { setBusy(false); }
}

// in flags block:
const canReverse = ["draft", "posted", "Posted"].includes(p.state);
```

Add the button in the actions bar next to existing Refund:

```tsx
{canReverse && (
  <button onClick={handleReverse} disabled={busy}
    className="px-3 py-1.5 rounded bg-red-700 text-white hover:bg-red-800 text-sm">
    הפוך תשלום
  </button>
)}
```

### 4.3 `PurchaseOrder360.tsx` — new cancel handler

```tsx
async function handleCancel() {
  const ok = await confirmCancelOrder({ order_number: po.order_number, total: po.total_amount });
  if (!ok) return;
  setBusy(true);
  try {
    await apiSend("POST", `/purchase-orders/${id}/cancel`, {});
    await refresh();
  } catch (e) { alert((e as Error).message); } finally { setBusy(false); }
}

const canCancel = !["cancelled", "closed", "completed"].includes(po.state);
```

---

## 5. window.confirm → globalConfirm Migration (5 unique callsites)

### 5.1 `email-template-manager.tsx:58`

```diff
-if (!window.confirm('Delete this template?')) return;
+if (!await globalConfirm({
+  title: "מחיקת תבנית",
+  message: "למחוק את תבנית האימייל? תבניות בשימוש בקמפיינים פעילים לא יישלחו.",
+  variant: "danger",
+  irreversible: true,
+  confirmText: "מחק תבנית",
+})) return;
```

### 5.2 `tasks-list.tsx:56`

```diff
-if (window.confirm('Delete this task?')) {
+if (await globalConfirm({
+  title: "מחיקת משימה",
+  message: "למחוק משימה זו? היסטוריית הסטטוסים והערות יימחקו לצמיתות.",
+  variant: "danger",
+  irreversible: true,
+})) {
```

### 5.3 `leads/bulk-actions.tsx:32`

```diff
-if (window.confirm(`Delete ${selectedLeads.length} leads?`)) {
+if (await globalConfirm({
+  title: "מחיקה מרובה",
+  message: `למחוק ${selectedLeads.length} לידים? פעולה זו אינה ניתנת לביטול וכוללת הודעות, פגישות וקבצים מקושרים.`,
+  variant: "danger",
+  irreversible: true,
+  confirmText: `מחק ${selectedLeads.length} רשומות`,
+})) {
```

### 5.4 `contracts-management.tsx:111`

```diff
-if (!window.confirm("למחוק חוזה זה?")) return;
+if (!await globalConfirm({
+  title: "מחיקת חוזה",
+  message: "למחוק את החוזה? סעיפים, תאריכי חידוש ומסמכים מצורפים יימחקו. פעולה זו אינה ניתנת לביטול.",
+  variant: "danger",
+  irreversible: true,
+})) return;
```

### 5.5 `BroadcastCampaignsPage.tsx:26`

```diff
-const ok = window.confirm("להפעיל את הקמפיין? פעולה זו תתחיל בשליחה.");
+const ok = await globalConfirm({
+  title: "הפעלת קמפיין",
+  message: "השליחה תתחיל מיידית לכל הנמענים שנבחרו. ניתן לעצור באמצע אך הודעות שכבר נשלחו לא יוחזרו.",
+  variant: "warning",
+  confirmText: "הפעל קמפיין",
+});
```

---

## 6. Hebrew Copy Style Guide (for this fix)

| Action | Title | Confirm CTA | Cancel CTA |
|---|---|---|---|
| Soft delete | "מחיקת X" | "מחק" | "ביטול" |
| Hard delete (irreversible) | "מחיקת X לצמיתות" | "מחק לצמיתות" | "חזור" |
| Cancel order | "ביטול הזמנה" | "בטל הזמנה" | "חזור" |
| Void invoice | "ביטול חשבונית" | "בטל חשבונית סופית" | "חזור" |
| Reverse payment | "היפוך תשלום" | "הפוך תשלום" | "חזור" |
| Status change (reversible) | "שינוי סטטוס" | "אישור" | "ביטול" |
| Activate / send | "הפעלת X" | "הפעל" | "ביטול" |

Canonical phrases (per `TRANSLATION_GUIDE.md:201`):
- Irreversibility: **"פעולה זו אינה ניתנת לביטול"**
- Two-step prompt: **"לחיצה שנייה תאשר סופית. האם להמשיך?"**
- Type-to-confirm prompt: **"להמשך, הקלידו: {token}"**

Use **"חזור"** instead of **"ביטול"** when the action verb already contains the word "ביטול" — avoids ambiguity ("Cancel cancellation").

---

## 7. Backend Routes Required

The UI wires above call three endpoints; two need to be added to `api-server`:

| Route | Status | Notes |
|---|---|---|
| `POST /api/v2/finance/invoices/:id/void` | EXISTS — `api-server/src/routes/finance/invoices.ts:329` | Already enforces state-machine `TRANSITIONS`. |
| `POST /api/v2/finance/payments/:id/reverse` | **MISSING** — only `/refund` exists | Add: state-machine guard `posted|draft → reversed`, audit row, GL reversal entries. |
| `POST /api/v2/procurement/purchase-orders/:id/cancel` | **VERIFY** — domain model defines `cancel_order` (see `MODULES_DETAIL_1_6.yaml:4322`) but route file should be confirmed | Same shape as void: state guard + audit + side-effects on receipts. |

Out of scope for this agent (UI-only fix); flagged for backend follow-up.

---

## 8. Test Plan

| # | Test | Expected |
|---|---|---|
| T-1 | Click Void on draft invoice | Confirm disabled (state guard); button hidden |
| T-2 | Click Void on issued invoice INV-001 | Dialog opens with banner "פעולה זו אינה ניתנת לביטול"; Confirm disabled |
| T-3 | Type wrong number "INV-999" | Confirm still disabled |
| T-4 | Type "INV-001" exactly | Confirm enables, button label "המשך" |
| T-5 | Click "המשך" | Banner switches to "לחיצה שנייה תאשר סופית"; button label switches to "בטל חשבונית סופית" |
| T-6 | Click "בטל חשבונית סופית" | Promise resolves true, prompt for reason appears, then `POST /void` |
| T-7 | Click "חזור" at any stage | Promise resolves false; typed input + step state reset on next open |
| T-8 | ESC / backdrop click | Same as Cancel — resolves false, state reset |
| T-9 | RTL layout | All Hebrew text right-aligned, typed input dir="ltr" for invoice number |
| T-10 | Bulk delete 3 leads | Title shows count, irreversible banner shown |
| T-11 | Send campaign | Warning variant (amber), no irreversible banner, no two-step |
| T-12 | Reverse payment, then reload | Status visible as "הוחזר" / reversed; audit row present |
| T-13 | Cancel order with receipts in `received` state | Server should reject — UI surfaces error toast, dialog already closed |
| T-14 | Keyboard-only flow | Tab order: typed input → Cancel → Confirm; Enter on enabled Confirm submits |
| T-15 | Existing string-only `globalConfirm("...")` callers | Behave identically to before (overload backwards-compat) |

---

## 9. Risk & Rollout

- **Backwards-compat:** All existing `globalConfirm("string")` callers continue to work — the new options form is additive. No call-site changes required outside the 5 migrations + 3 destructive wrappers above.
- **No state-machine changes:** This fix only adds UI gating. Server-side guards in `finance/invoices.ts:341-345` (`TRANSITIONS[from]`) remain authoritative — UI confirmations are a usability layer, not a security layer.
- **Audit trail unchanged:** Every confirmed action still hits the existing `logAudit` paths.
- **Per `ai-policy-engine.ts`:** the three HIGH-risk actions (`cancel_order`, `void_invoice`, `reverse_payment`) now match the policy classification with a UI gate of equivalent severity.

---

## 10. Acceptance Criteria

- [x] `confirm-dialog.tsx` exposes `requireTyping`, `twoStep`, `irreversible`, `entityLabel` options.
- [x] 5 unique `window.confirm` callsites in `erp-app/src` migrated to `globalConfirm` with Hebrew copy.
- [x] `cancel_order`, `void_invoice`, `reverse_payment` each gated by `confirmCancelOrder` / `confirmVoidInvoice` / `confirmReversePayment` — each uses `twoStep`, `irreversible: true`; void + reverse additionally use `requireTyping`.
- [x] Hebrew style table documented; canonical irreversibility phrase preserved.
- [x] Backend follow-up flagged: `/payments/:id/reverse` missing route, `/purchase-orders/:id/cancel` to verify.
- [x] All existing string-form `globalConfirm` callers unaffected.

---

## 11. Cross-References

- `_qa-reports-25/AGENT-175-confirmations.md` — origin audit (90 callsites, missing two-step, missing typed gate, no UI for cancel/void/reverse).
- `api-server/src/lib/ai-policy-engine.ts:53-67` — risk classifications matched by this fix.
- `api-server/src/routes/finance/invoices.ts:329-368` — existing void route (server-side authority).
- `AI-Task-Manager/.agents/skills/erp-delete/SKILL.md` — canonical confirm pattern this fix extends.
- `_qa-reports/QA-11-ux.md:90` BUG-UX-A04 — payslip PDF zero-confirm (closeable separately by reusing `confirmVoidInvoice` shape with `requireTyping: payslipNumber`).
- `_qa-reports/QA-19-blockers.md:277` — tax-filing two-step recommendation (this fix's `twoStep` flag is the primitive that closes it).
