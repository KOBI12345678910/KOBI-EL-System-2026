# AGENT-175 — Destructive Action Confirmations Audit

**Scope:** Audit confirmation flows for delete / void / cancel / reverse across the ERP. Assess Hebrew copy, two-step gating for irreversible actions, and type-to-confirm for severe operations.

## 1. Summary

| Aspect | Status | Notes |
|---|---|---|
| Single shared Confirm primitive | PARTIAL | `erp-app/src/components/confirm-dialog.tsx` exists but ~90 `window.confirm` callsites remain |
| Hebrew copy on dialogs | GOOD | Default title `"אישור מחיקה"`, `"מחק"`, `"ביטול"`, `dir="rtl"` |
| Two-step for irreversible | MISSING | No two-step / "are-you-really-sure" wrapper anywhere in repo |
| Type-to-confirm for severe | MISSING | No `requireTyping` / typed-name gate found |
| Variant differentiation | PARTIAL | `danger / warning / info` variants exist but rarely used; almost everything is single `danger` |
| Cancel / Void / Reverse confirmations | INCONSISTENT | Most rely on form submit + status PATCH with no client-side prompt |

## 2. Inventory of Confirmation Mechanisms

### 2.1 The good — `ConfirmDialogProvider`
File: `erp-app/src/components/confirm-dialog.tsx`
- Three variants: `danger` (Trash2, red), `warning` (AlertTriangle, amber), `info` (Info, blue).
- Hebrew defaults — title `"אישור מחיקה"`, confirm `"מחק"`, cancel `"ביטול"`, full `dir="rtl"`.
- Two entrypoints: hook (`useConfirmDialog`) and global (`globalConfirm`) for non-React (e.g. bulk-actions).
- Wired into `App.tsx` via `<ConfirmDialogProvider>` at lines 2902 and 2947.
- Used 139 times across ~50 files (mostly `pages/builder/*`, `pages/strategy/*`, `pages/support/*`).

### 2.2 The skill spec
`AI-Task-Manager/.agents/skills/erp-delete/SKILL.md` documents the canonical pattern:
```
confirm({ variant: "danger", title: "אישור מחיקה",
          confirmText: "מחק לצמיתות", cancelText: "ביטול" })
```
And bulk: `globalConfirm("למחוק 3 רשומות? פעולה זו אינה ניתנת לביטול.")`.

This is the spec the codebase is *supposed* to follow. Compliance is partial.

### 2.3 The bad — raw `window.confirm`
**90 occurrences across 50 files** still use native `window.confirm`. Examples:
- `erp-app/src/components/email/email-template-manager.tsx:58` — `window.confirm('Delete this template?')` — **English**, no Hebrew, no styling.
- `erp-app/src/components/tasks/tasks-list.tsx:56` — `window.confirm('Delete this task?')` — same problem.
- Multiple `erp-mobile/app/warehouse/*.tsx` files use raw `confirm()` without variant or RTL.

These bypass the design-system dialog, lack RTL/Hebrew, and are visually inconsistent.

## 3. Coverage by Destructive Verb

### 3.1 Delete — covered, mostly Hebrew
Standard pattern `globalConfirm("למחוק X זה? פעולה זו אינה ניתנת לביטול.")` is used in:
- `pages/strategy/{swot,goals,competitive-analysis,business-plan}-page.tsx`
- `pages/usage-logs.tsx`, `pages/support/tickets.tsx`
- `components/attachments-section.tsx` (`"האם למחוק קובץ זה?"`)
- `components/bulk-actions.tsx` line 65: `"האם למחוק N רשומות? פעולה זו אינה ניתנת לביטול."`
- `pages/ehs/waste-management.tsx` line 202: minimal `"למחוק?"` — too terse, no entity name.

**Gap:** No record-name interpolation for severe deletes (e.g., delete supplier with FK chain). The DELETE skill catches `23503` FK violations server-side (`SKILL.md:151`) but the user is not warned client-side before the round-trip.

### 3.2 Cancel (orders, invoices, share-links) — NO confirmation prompt
Searched `cancel_order`, `void_invoice`, `cancel`, `ביטול`. Findings:
- `MODULES_DETAIL_1_6.yaml:4322` defines `cancel_order` button with `type: button_danger` but no `confirmation:` field.
- `api-server/src/routes/finance/invoices.ts:327-366` — `POST /:id/void` server route returns Hebrew error `"לא ניתן לבטל חשבונית מסטטוס {from}"`. No client wrapper exists in `erp-app` that prompts before calling.
- `api-server/src/routes/dms.ts:700` — share-link revoke returns `"אין לך הרשאה לבטל קישור שיתוף זה"` but again — no client gate.
- `api-server/src/lib/ai-policy-engine.ts:56-57` flags `cancel_order` and `void_invoice` as `'HIGH'` risk yet UI side has nothing matching.

**Gap (severe):** Order cancel and invoice void are HIGH-risk per policy engine, irreversible (status terminal), and have **no UI confirmation at all** in the audited paths.

### 3.3 Void — server-only
`POST /finance/invoices/:id/void` (`finance/invoices.ts:327`) executes immediately on call. No two-step. No "type the invoice number to confirm." UI buttons calling this route do not appear to gate it — the only Hebrew text is in error responses.

### 3.4 Reverse — payment reversal undocumented in UI
`AGENT-60-shared-workflows.md:82-84` notes the `payment` state machine has `reverse` from both `draft` and `posted` → `reversed`. No UI button or confirmation surface was found for this transition. The state machine is wired (`AGENT-29-state-machines.md:34`) but the action is invisible to users — and reversing a posted payment is among the most severe accounting actions in the system.

## 4. Two-Step / Type-to-Confirm — Both Missing

Searched `two.step|twoStep|second.confirm|requireTyping|הקלד.*לאישור|type.*to.*confirm`:
- **Zero hits** for type-to-confirm or two-step destructive flows in `erp-app` or `api-server`.
- The only "two-step" in code is `lib/object-storage-web/src/use-upload.ts:26` — presigned URL upload, not destruction.
- `_qa-reports/QA-19-blockers.md:277` already flagged this: *"Fix: Two-step submission: (a) preview totals, (b) explicit confirm."* — for tax filings. Recommendation never landed.
- `_qa-reports/QA-11-ux.md:90` flagged BUG-UX-A04 CRITICAL: payslip PDF issuance has zero `confirm()`. Still open per this audit's grep.

## 5. Severity-Ranked Findings

| # | Severity | Finding | Evidence |
|---|---|---|---|
| F-1 | CRITICAL | Order cancel / invoice void / payment reverse have **no UI confirmation** despite `ai-policy-engine` rating them HIGH | `ai-policy-engine.ts:56-57`, `finance/invoices.ts:327` |
| F-2 | CRITICAL | No type-to-confirm anywhere — protected admin actions (delete supplier with orders, delete user, purge tenant) all use a single OK click | repo-wide grep |
| F-3 | HIGH | No two-step pattern — irreversible actions (void, payment-reverse, hard-delete) commit on first OK | repo-wide grep |
| F-4 | HIGH | 90 raw `window.confirm` callsites — inconsistent UX, some in **English** (`'Delete this template?'`, `'Delete this task?'`) | `email-template-manager.tsx:58`, `tasks-list.tsx:56` |
| F-5 | MEDIUM | Bulk-delete confirm uses count but never lists / previews items | `bulk-actions.tsx:65` |
| F-6 | MEDIUM | Variant API exists (`warning`/`info`) but is virtually unused — every prompt is `danger` even for reversible status flips | `confirm-dialog.tsx:45-64` |
| F-7 | MEDIUM | Terse copy `"למחוק?"` without entity context | `ehs/waste-management.tsx:202` |
| F-8 | LOW | No `executeDelete` equivalent for cancel/void/reverse — only delete has a hook | `use-api-action.tsx`, `SKILL.md` |

## 6. Recommended Pattern (proposed)

Extend `confirm-dialog.tsx`:
```tsx
interface ConfirmOptions {
  // ...existing
  requireTyping?: string;          // user must type this exact string (e.g. invoice number)
  twoStep?: boolean;               // first OK shows secondary "באמת? פעולה בלתי הפיכה" prompt
  irreversible?: boolean;          // adds red banner "פעולה זו אינה ניתנת לביטול"
  entityLabel?: string;            // shown in title for context
}
```

Wire severity tiers:
- **Reversible status change** (e.g. mark inactive): single confirm, `warning` variant.
- **Soft-delete / cancel** (recoverable from recycle-bin / draft): single confirm, `danger`, irreversible banner.
- **Void invoice / reverse payment / hard-delete**: `twoStep: true` + `requireTyping: invoiceNumber`.
- **Tenant purge / payslip PDF issuance / tax form file**: `twoStep: true` + `requireTyping: "DELETE"` + admin re-auth.

Use Hebrew prompt strings:
- `"להמשיך? פעולה זו אינה ניתנת לביטול."`
- `"להקלדת אישור, הקלידו: {token}"`
- `"לחיצה שנייה תאשר סופית."`

## 7. Top 5 Action Items (P0)

1. **Add UI confirmation to `cancel_order`, `void_invoice`, `reverse_payment`** — currently HIGH-risk per policy engine but click-once in UI.
2. **Implement `requireTyping` in `confirm-dialog.tsx`** — needed for invoice void and payment reverse.
3. **Implement `twoStep` flag** — gate all irreversible accounting actions.
4. **Migrate 90 `window.confirm` callsites to `globalConfirm`** — start with the English ones in `tasks-list.tsx` and `email-template-manager.tsx`.
5. **Hebrew style-guide entry** — codify `"פעולה זו אינה ניתנת לביטול"` as the canonical irreversibility phrase (per `TRANSLATION_GUIDE.md:201`).

## 8. Files Audited (key paths)

- `erp-app/src/components/confirm-dialog.tsx` — primitive
- `erp-app/src/components/bulk-actions.tsx` — bulk delete gate
- `erp-app/src/hooks/use-api-action.tsx` — `executeDelete` wrapper
- `erp-app/src/components/email/email-template-manager.tsx` — English `window.confirm`
- `erp-app/src/components/tasks/tasks-list.tsx` — English `window.confirm`
- `api-server/src/routes/finance/invoices.ts` — server void route, no client gate
- `api-server/src/lib/ai-policy-engine.ts` — risk classification
- `AI-Task-Manager/.agents/skills/erp-delete/SKILL.md` — canonical spec
- `_qa-reports/QA-11-ux.md`, `QA-19-blockers.md` — prior flags still open
