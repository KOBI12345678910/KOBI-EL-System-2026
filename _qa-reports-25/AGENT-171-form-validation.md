# AGENT-171 — Form Validation UX Audit (Clients)

Date: 2026-04-29
Scope: `erp-app/` (primary client). Other client dirs: `lib-client` (no form code), `mobile-app`, `desktop-tutorial-client` (out of scope of "forms").

## TL;DR

The shadcn `Form` component (`erp-app/src/components/ui/form.tsx`) wired correctly to `react-hook-form` + ARIA exists, **but is dead code** — zero pages import it. Pages instead use a hand-rolled `useFormValidation` hook (`erp-app/src/hooks/use-form-validation.tsx`) plus `<FormFieldError>` / `<RequiredMark>` helpers. That hook ships with no `react-hook-form` integration, no `zodResolver`, no ARIA wiring, and **broken validation in 4 critical CRM pages**.

**Severity:** P1 (functional bug + a11y debt) for the platform-wide validation path.

---

## 1. Stack reality

| Tooling | Status |
|---|---|
| `react-hook-form` ^7.71.2 | Installed but only imported by `components/ui/form.tsx` (1 file). |
| `@hookform/resolvers` ^3.10.0 | Installed, **0 imports** anywhere. |
| `zod` (catalog) | Installed, **0 `zodResolver` calls** in clients. |
| `useFormValidation` (custom) | Imported by **100+ pages** (search hit limit at 100). |
| `<FormFieldError>` rendered | 80 occurrences across 39 files. |
| `<RequiredMark>` rendered | 14+ files (sample of 5: contracts, collections, env-permits, safety-inspections, waste-mgmt). |

The "Form" component built on RHF + Slot + Label primitives (exposes `aria-invalid`, `aria-describedby`, label `htmlFor`) is correct shadcn boilerplate but **unused**. Effective form layer = the custom hook.

---

## 2. Critical bug — `validateAll` does not exist

`useFormValidation` (lines 18-89) returns `{ errors, validate, validateField, clearErrors, clearFieldError, setFieldError, hasErrors, getFieldProps }`. There is **no** `validateAll`.

Yet 4 pages call `validation.validateAll(form)`:

```
erp-app/src/pages/crm/territory-management.tsx:119
erp-app/src/pages/crm/contract-management.tsx:140
erp-app/src/pages/crm/commission-management.tsx:167
erp-app/src/pages/crm/leads-ultimate.tsx:158
```

Pattern: `if (!validation.validateAll(form)) return;`

At runtime this throws `TypeError: validation.validateAll is not a function` and the save handler never executes. **Save silently fails on the entire CRM contract / territory / commission / leads-ultimate flows.** Either rename the method to `validate` in the 4 callsites or add an alias `validateAll = validate` in the hook.

---

## 3. ARIA / a11y gaps in the custom validation path

`<FormFieldError>` (hooks/use-form-validation.tsx:91-94):

```tsx
export function FormFieldError({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="text-xs text-red-400 mt-1">{error}</p>;
}
```

Issues:
- No `role="alert"` and no `aria-live="polite"` — screen readers do not announce the error when it appears.
- No `id` and no `aria-describedby` linkage to the offending input. Inputs in pages render plain `<input>` tags with no `id`, no `aria-invalid`, no `aria-describedby`.
- `border-red-500` from `getFieldProps().className` is **never applied** — pages don't spread `getFieldProps`. Visual error state is missing too; only the helper text turns red.

Whole-codebase counts:
- `aria-invalid` / `aria-describedby` in `pages/`: **0**.
- `role="alert"` / `aria-live`: 2 files only (`ui/alert.tsx`, `ui/field.tsx`) — neither wired into the form path.
- `aria-required`: **0**.

`<RequiredMark>` is purely a red asterisk span — no `aria-hidden="true"` and the asterisk is not paired with `aria-required` on the matching input, so SR users hear "asterisk" but not "required".

`<label>` elements throughout the dialogs are bare `<label className="text-sm font-medium">…</label>` without `htmlFor`; the `<input>` has no `id`. Click-on-label-to-focus is broken and SR association is missing.

---

## 4. RTL Hebrew

- `erp-app/index.html` sets `lang="he"` but **not `dir="rtl"`** at the `<html>` level. No code path calls `document.documentElement.dir = "rtl"` (grep returned 0).
- RTL is set ad-hoc via `dir="rtl"` props on individual containers (~10 occurrences in App.tsx, factory-digital-twin, ai-copilot, command-palette, ai-form-fill, etc.). Form dialogs in CRM/finance/etc. do not set `dir="rtl"` on the modal container; they rely on inherited direction that is never globally established.
- Error message strings are localized to Hebrew (`"שדה חובה"`, `"מינימום N תווים"`, `"מקסימום N תווים"`, `"ערך מינימלי"`, `"ערך מקסימלי"`, `"ערך לא תקין"`). No i18n framework — hard-coded Hebrew.
- Input padding: search bars use `pr-10 pl-4` patterns (RTL-correct), but error messages have `mt-1` only — fine. The `RequiredMark` uses `mr-0.5` which in RTL renders as left-margin-right-of-text — correct visually next to the Hebrew label.

---

## 5. Focus management

- `<input>` `autoFocus`: 15 occurrences across 10 files (chat, calendar, kobi-ide, forgot-password). **No CRUD dialog auto-focuses the first invalid field on validation failure.**
- No `useRef` + `.focus()` patterns in `pages/` (grep returned 0). Validation failure does not move focus — user must scroll to find the red error text.
- Custom modals are plain `fixed inset-0` divs (e.g. `pages/crm/contract-management.tsx:349`). They have **no `role="dialog"`, no `aria-modal`, no focus trap, no `aria-labelledby`** binding to the heading. ESC-to-close, focus-restore-on-close, and tab-trapping are all missing.
- Of 25 surveyed page-form modals, **none** import `@/components/ui/dialog`; they all reimplement the modal manually. The shadcn Radix-based Dialog (which provides focus trap + ESC + ARIA out of the box) is bypassed.

---

## 6. Form submission semantics

- `<form>` elements with `onSubmit`: 13 occurrences across 10 files (mostly auth, builder, integration pages).
- `type="submit"` buttons: 16 across 10 files.
- The vast majority of CRUD save buttons are `<button onClick={save}>` outside any `<form>`. Consequence:
  - Enter-to-submit does not work in those dialogs.
  - Browser-native validation (`required`, `pattern`) is bypassed.
  - The save handler runs even when the broken `validateAll` throws (depending on try/catch wrapping).

---

## 7. Inventory of forms by validation pattern

| Pattern | Files (sample) | Count |
|---|---|---|
| `useFormValidation` imported | `pages/strategy/*`, `pages/quality/*`, `pages/projects/*`, `pages/production/*`, `pages/crm/*`, `pages/finance/*`, `pages/hr/*`, `pages/modules/*`, `pages/marketing/*`, `pages/logistics/*` | 100+ (limit hit) |
| Imports hook but **never uses it** (e.g. only imports `FormFieldError, RequiredMark` and never renders) | `pages/finance/expense-claims.tsx`, `pages/strategy/swot-page.tsx`, … | majority of the 100+ |
| Actually renders `<FormFieldError>` | contracts-dashboard, crm/{contract,commission,territory,leads-ultimate,leads-management,smart-routing,field-agents,dynamic-pricing,sla,contractor-decision,collections}, marketing/campaigns, logistics/{fleet,delivery}, production/{many}, quality/{capa,testing-lab,spc,complaints}, ehs/{risk,safety,waste,env}, finance/{cash-flow,payments,budgets} | 39 files |
| Calls broken `validation.validateAll(form)` | crm/{territory,contract,commission,leads-ultimate} | **4 (broken save)** |
| Uses shadcn `<Form>` from `ui/form.tsx` | none | 0 |

---

## 8. Recommendations (ordered by impact)

1. **Fix the broken save in 4 CRM pages.** Either:
   - Add `validateAll: validate` to the `useFormValidation` return, or
   - Rename the 4 callsites to `validation.validate(form)`.
   This is a one-line bug blocking contract/territory/commission/leads-ultimate creation.

2. **Wire ARIA in `<FormFieldError>` and the input pairing helper.** Update to:
   ```tsx
   <p id={errorId} role="alert" aria-live="polite" className="text-xs text-red-400 mt-1">{error}</p>
   ```
   and have `getFieldProps` return `{ id, 'aria-invalid': !!error, 'aria-describedby': error ? errorId : undefined }` plus the `border-red-500` class. Pages then spread it onto the input. This costs ~20 lines in the hook and unlocks SR support globally without touching pages.

3. **Set `dir="rtl"` on `<html>` in `index.html`** (single-line change). Removes the per-component `dir="rtl"` patchwork.

4. **Move CRUD dialogs to `@/components/ui/dialog` (Radix).** Provides focus trap, ESC, focus restore, ARIA dialog role for free. Migration can be incremental.

5. **Adopt the existing shadcn `Form` + RHF + zod path** for new forms. The infrastructure (`@hookform/resolvers`, `zod`, `Form`/`FormField`/`FormControl`/`FormMessage`) is already installed — only the call-site adoption is missing. The custom hook can stay for legacy pages.

6. **Auto-focus first invalid field** after `validate()` returns false (one util added to the hook: store `firstErrorRef`, call `.focus()` in a `useEffect` on errors change).

7. **Audit and clean up unused `useFormValidation` imports** — most of the 100+ pages import the hook and helpers but never call them, hiding which forms actually validate at all.

---

## Key files referenced (absolute)

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\hooks\use-form-validation.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\components\ui\form.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\components\ui\input.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\index.html`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\pages\crm\contract-management.tsx` (line 140 — broken `validateAll`, line 349 — manual modal)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\pages\crm\territory-management.tsx:119`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\pages\crm\commission-management.tsx:167`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\pages\crm\leads-ultimate.tsx:158`
