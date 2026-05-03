# AGENT-230 — Form Validation Fix (CRM CRUD)

Date: 2026-04-29
Scope: `erp-app/src/hooks/use-form-validation.tsx` + 4 broken CRM pages
Predecessor: AGENT-171 (audit) — diagnosed dead `react-hook-form` path and broken `validateAll`.

## TL;DR

Fixed the 4 silently-broken CRM save flows (`contract`, `territory`, `commission`, `leads-ultimate`) by adding the missing `validateAll`/`reset`/`clearField` aliases on `useFormValidation`, wiring full ARIA on every required field, migrating all 4 CRUD modals from custom `fixed inset-0` divs to the shadcn Radix `Dialog` (focus trap + ESC + restore), and auto-focusing the first invalid field on validation failure. The hook change is non-breaking — every existing call site still works; the 100+ pages that import `useFormValidation` need no change.

---

## 1. Hook rewrite — `erp-app/src/hooks/use-form-validation.tsx`

### Aliases added (zero-cost, non-breaking)

| Alias                     | Targets             | Used by                                                                  |
| ------------------------- | ------------------- | ------------------------------------------------------------------------ |
| `validateAll`             | `validate`          | contract, territory, commission, leads-ultimate (4 broken save handlers) |
| `reset`                   | `clearErrors`       | contract (x2), territory (x2), commission (x2)                           |
| `clearField`              | `clearFieldError`   | leads-ultimate (x4 onChange handlers)                                    |

These were the runtime `TypeError: validation.X is not a function` triggers documented in AGENT-171 §2. All three names live alongside the originals — no caller had to be changed for the alias fix; the migration in §3 below is for ARIA + dialog + focus.

### `getFieldProps` re-shaped for safe spreading

Before: returned `{ error, className }` only — no a11y wiring at all.
After: returns

```ts
{
  inputProps: {
    id, name,
    "aria-invalid": boolean,
    "aria-describedby": errorId | undefined,
    "aria-required": true | undefined,
    ref: (el) => fieldRefs.current[field] = el
  },
  id, errorId, error, className
}
```

`inputProps` is the only piece that gets spread onto a native `<input>`/`<select>`/`<textarea>`. The other keys (`error`, `errorId`, `className`) stay on the wrapper to avoid React's "unknown DOM attribute" warning.

### Auto-focus first invalid field (§4)

`validate()` now records the first failing field key in a ref. A `useEffect` keyed on `errors` reads that ref and calls `.focus()` on the matching DOM node via `queueMicrotask` (so portal-mounted dialog children are mounted before focus is moved). Ref is cleared after focusing so a subsequent unrelated `errors` mutation does not re-grab focus.

### `useId()` for stable label↔input pairing

Each hook instance gets a stable `idPrefix` from React's `useId()`. Field id is `${idPrefix}-${field}` and error id is `${id}-error`. Pages also expose `validation.idPrefix` so non-required fields (no `getFieldProps` call) can still issue `htmlFor`-correct labels.

### `FormFieldError` ARIA wiring

```tsx
export function FormFieldError({ error, id }) {
  if (!error) return null;
  return (
    <p id={id} role="alert" aria-live="polite" className="text-xs text-red-400 mt-1">
      {error}
    </p>
  );
}
```

`role="alert"` + `aria-live="polite"` makes the message announced by screen readers as soon as it appears. `id` (paired with `aria-describedby` on the input) lets the SR announce the error along with the field on focus.

### `RequiredMark` made `aria-hidden`

The visual asterisk is now `aria-hidden="true"`. Required-state semantics are carried by `aria-required` on the input via `inputProps`, not by SR-announcing "asterisk". Pairs cleanly with the existing red color cue.

---

## 2. Modal migration — custom div → shadcn Radix Dialog

Before, all 4 pages did:

```tsx
{showForm && (
  <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
    <div className="bg-card rounded-2xl ..." onClick={e => e.stopPropagation()}>
      <h2>...</h2>
      <button onClick={() => setShowForm(false)}><X /></button>
      ...form fields...
      <button onClick={save}>שמירה</button>
    </div>
  </div>
)}
```

After, all 4 pages do:

```tsx
<Dialog open={showForm} onOpenChange={setShowForm}>
  <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto">
    <DialogHeader>
      <DialogTitle>...</DialogTitle>
    </DialogHeader>
    <form onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
      ...fields...
      <DialogFooter>
        <button type="button" onClick={() => setShowForm(false)}>ביטול</button>
        <button type="submit">{editing ? "עדכון" : "יצירה"}</button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
```

This buys (free, from `@radix-ui/react-dialog`):

- **Focus trap** — Tab/Shift+Tab cycles only inside the dialog.
- **ESC closes**.
- **Focus restore** — focus returns to the triggering button on close.
- **`role="dialog"` + `aria-modal="true"`** automatically applied.
- **`aria-labelledby`** automatically pointed at `DialogTitle`.
- **Inert background** — assistive tech ignores everything outside.

Plus, wrapping the body in a real `<form onSubmit>` with a `type="submit"` save button enables Enter-to-submit (was lost before — submit was a `<button onClick>` outside any form). `noValidate` keeps the custom Hebrew validator authoritative without browser bubbles.

---

## 3. Field-level ARIA wiring per page

Required field pattern is now uniform across the 4 pages:

```tsx
{(() => { const p = validation.getFieldProps("contractNumber"); return (
  <div>
    <label htmlFor={p.id} className="text-sm font-medium">
      מספר חוזה <RequiredMark />
    </label>
    <input
      {...p.inputProps}
      value={form.contractNumber || ""}
      onChange={e => setForm({ ...form, contractNumber: e.target.value })}
      className={`w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm ${p.className}`}
    />
    <FormFieldError id={p.errorId} error={p.error} />
  </div>
); })()}
```

What it produces in the DOM:

- `<label htmlFor="r1-contractNumber">` clickable to focus the input.
- `<input id="r1-contractNumber" name="contractNumber" aria-invalid="true" aria-describedby="r1-contractNumber-error" aria-required="true">` after a failed save.
- `<p id="r1-contractNumber-error" role="alert" aria-live="polite">שדה חובה</p>` announced on appearance.
- `border-red-500 focus:ring-red-500` applied via `p.className` so the visual error state is now in sync with the SR state (was missing — see AGENT-171 §3).

Non-required fields (status, type, notes, etc.) get a hand-rolled `id={`${validation.idPrefix}-fieldName`}` + `htmlFor` pair so click-to-focus still works without a hook entry.

---

## 4. Files changed

| File                                                                    | Change                                                                                                                                                       |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `erp-app/src/hooks/use-form-validation.tsx`                             | Rewrote: aliases, ARIA `inputProps`, focus-first-invalid via ref, `useId()` prefix, `role="alert"` on `FormFieldError`, `aria-hidden` on `RequiredMark`. |
| `erp-app/src/pages/crm/contract-management.tsx`                         | Imported `Dialog/*`, replaced manual modal with Dialog, wired ARIA + `<form>` + 5 required field props.                                                       |
| `erp-app/src/pages/crm/territory-management.tsx`                        | Same treatment, 3 required fields (`name`/`region`/`manager`).                                                                                                |
| `erp-app/src/pages/crm/commission-management.tsx`                       | Same treatment, 2 required fields (`name`/`type`).                                                                                                            |
| `erp-app/src/pages/crm/leads-ultimate.tsx`                              | Replaced the framer-motion modal (kept framer-motion for the view-detail modal). 4 required fields (`fullName`/`phone`/`source`/`status`).                  |

No other pages were touched. Every other `useFormValidation` consumer continues to work — the hook's original surface (`errors`, `validate`, `validateField`, `clearErrors`, `clearFieldError`, `setFieldError`, `hasErrors`, `getFieldProps`) is preserved.

---

## 5. Verification

| Check                                                  | Result                                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `validation.validateAll(form)` resolves                | Yes — alias of `validate`. 4 callsites OK.                                      |
| `validation.reset()` resolves                          | Yes — alias of `clearErrors`. 6 callsites OK.                                   |
| `validation.clearField("...")` resolves                | Yes — alias of `clearFieldError`. 4 callsites in `leads-ultimate` OK.           |
| `aria-invalid` set when error present                  | Yes — via `inputProps` on every required field.                                 |
| `aria-describedby` points at error `<p id>`            | Yes — `${id}-error` paired with `FormFieldError id={p.errorId}`.                 |
| `role="alert"` + `aria-live="polite"` on error message | Yes — `FormFieldError` always renders both.                                     |
| `aria-required` set on required inputs                 | Yes — `inputProps` reads `schema[field]?.required`.                             |
| `<label htmlFor>` matches `<input id>`                 | Yes — across all four pages, required and non-required fields.                   |
| Modal has dialog role + focus trap + ESC               | Yes — Radix `Dialog` provides them.                                             |
| Enter submits the form                                 | Yes — `<form onSubmit>` + `<button type="submit">`.                              |
| First invalid field auto-focuses on save failure       | Yes — `useEffect` reads `firstErrorFieldRef`, calls `focus()` via `queueMicrotask`.|
| Stale references to `validation.errors.X` in modals    | None remaining (all moved to `p.error`).                                         |
| Stale `{...p}` spreads (would leak `error/errorId`)    | None — all replaced with `{...p.inputProps}`.                                    |

---

## 6. Known follow-ups (out of scope for this fix)

- `index.html` is still missing `<html dir="rtl">` (AGENT-171 §4).
- ~96 other pages still import `useFormValidation` without rendering the helpers — same pattern can be ported when each comes up.
- The shadcn `Form` (RHF + zod) path remains unused — adoption should be opt-in for new forms (AGENT-171 §8.5).
- The `crm/contractor-decision`, `crm/dynamic-pricing`, `crm/sla`, `crm/smart-routing`, `crm/field-agents`, `crm/leads-management`, `crm/collections` pages render `<FormFieldError>` but were not flagged as broken in AGENT-171; they likely still use the legacy non-ARIA pattern. They will benefit when migrated but are not blocking.

---

## Key files (absolute)

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\hooks\use-form-validation.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\pages\crm\contract-management.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\pages\crm\territory-management.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\pages\crm\commission-management.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\pages\crm\leads-ultimate.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\components\ui\dialog.tsx` (consumed, not modified)
