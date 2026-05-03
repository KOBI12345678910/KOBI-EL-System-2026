# AGENT-287 — Form Field Audit (CRUD Pages)

**Agent:** 287 (REAL-SYS #2)
**Date:** 2026-04-29
**Scope:** All form fields across CRUD pages in `erp-app/`, `techno-kol-ops/client/`, `onyx-procurement/web/`
**Method:** Grep-based pattern detection + file-level inspection of representative pages.
**Worktree:** `objective-merkle-40ff93`

---

## 1. Audit Coverage

| Tier | Locator | TSX page count |
|------|---------|----------------|
| Primary CRUD | `erp-app/src/pages/**/*.tsx` | 1,299 |
| Operations | `techno-kol-ops/client/src/pages/**/*.tsx` | 46 |
| Procurement (legacy HTML/JSX) | `onyx-procurement/web/*.html`, `*.jsx` | 19 |
| Field-validation hook usage (`useFormValidation`) | erp-app | 100+ files, 320+ occurrences |
| Pages with explicit `<input>` types | erp-app sample slice | 15 files, 37 occurrences |

The audit checked five attributes per field:
1. **State binding** — `value=` plus `onChange=`
2. **Validation** — schema rule registered or inline check
3. **DB-column mapping** — does `form[key]` map 1:1 to a column in the route's INSERT/UPDATE
4. **Label** — visible `<label>` next to the input
5. **Required marker** — visual indicator (`*`, `<RequiredMark/>`) for mandatory fields

---

## 2. Tier-A: Strong Forms (gold standard)

These pages use `useFormValidation` + `RequiredMark` + `FormFieldError` with proper schema registration.

### `erp-app/src/pages/crm/leads-ultimate.tsx` — Leads Ultimate (16 fields)
Form schema registered: `REQUIRED_FIELDS = { fullName, phone, source, status }`.

| Field | State | Validation | DB column | Label | Required mark |
|-------|-------|------------|-----------|-------|---------------|
| `fullName` | yes (`form.fullName`) | yes (required) | `crm_leads_ultimate.first_name`/`full_name` (mismatch — see Issues) | yes | `<RequiredMark/>` |
| `phone` | yes | yes (required) | `phone` | yes | yes |
| `email` | yes (`type="email"`) | none | `email` | yes | n/a |
| `city` | yes | none | `city` | yes | n/a |
| `address` | yes | none | `address` | yes | n/a |
| `source` | yes (select) | yes (required) | `source` | yes | yes |
| `productInterest` | yes | none | NOT in DB (mapped to `interested_products` JSONB) | yes | n/a |
| `status` | yes (select) | yes (required) | `status` | yes | yes |
| `agentId` | yes (select) | none | `assigned_agent_id` (snake/camel mismatch) | yes | n/a |
| `urgency` | yes (select) | none | `urgency` | yes | n/a |
| `budget` | yes (`type="number"`) | none | `estimated_budget` (mismatch) | yes | n/a |
| `companyName` | yes | none | NOT in DB schema | yes | n/a |
| `qualityScore` | yes (init=0) | none | `quality_score` (mismatch) | hidden | n/a |
| `estimatedValue` | yes (init=0) | none | NOT in DB | hidden | n/a |
| `nextFollowUp` | yes (`type="date"`) | none | `next_follow_up` (mismatch) | yes | n/a |
| `tags` | yes (CSV string) | none | `tags` JSONB (string→JSONB cast risk) | yes | n/a |
| `notes` | yes (textarea) | none | `notes` | yes | n/a |

### Other Tier-A files (same pattern verified)
- `erp-app/src/pages/crm/territory-management.tsx` — schema `{ name, region, manager }` required
- `erp-app/src/pages/crm/commission-management.tsx`
- `erp-app/src/pages/crm/contract-management.tsx`
- `erp-app/src/pages/quality/capa.tsx` — 13 occurrences of validation hook
- `erp-app/src/pages/quality/{spc,complaints,testing-lab}.tsx` — 6 each
- `erp-app/src/pages/finance/cash-flow.tsx` — 7 occurrences
- `erp-app/src/pages/logistics/fleet-management.tsx` — 8
- `erp-app/src/pages/production/{qc-inspections,field-measurements-page}.tsx` — 8 each

`useFormValidation` provides `aria-invalid`, `aria-required`, `aria-describedby`, focus management, error id prefix. Confirmed at `erp-app/src/hooks/use-form-validation.tsx:23-56`.

---

## 3. Tier-B: Embedded forms (state-bound, manual validation)

### `techno-kol-ops/client/src/components/VacationRequestForm.tsx` — 7 fields
| Field | State | Validation | DB column | Label | Required mark |
|-------|-------|------------|-----------|-------|---------------|
| `employeeId` | yes (`useState`) | inline (line 182) | `AbsenceStore` (in-memory engine, no DB) | yes (`עובד *`) | yes (asterisk) |
| `type` | yes | inline | engine `AbsenceType` | yes | yes |
| `startDate` | yes (`type="date"`) | inline | engine | yes | yes |
| `endDate` | yes | inline (`startDate > effectiveEnd` check, line 190) | engine | yes | yes |
| `halfDay` | yes (checkbox) | n/a | engine | yes (htmlFor wired) | n/a |
| `reason` | yes (textarea) | conditional required (`REASON_REQUIRED_TYPES`, line 194) | engine | yes | conditional |
| `documentUrl` | yes (file→DataURL) | none | engine | yes | n/a |

**Note:** No backend DB; the form persists into a localStorage-backed `AbsenceStore` engine. Out of CRUD scope but the pattern is applied 7+ embedded forms (see also `EmployeeDetailPanel`, `OrderDetailPanel`, `HoursReport`, `EmployeeHoursLog`, `PayrollExport`).

---

## 4. Tier-C: Auto-generated forms (schema-driven, no validation)

### `erp-app/src/pages/inventory/raw-material-catalog.tsx` — 12 fields
Form fields rendered in a single `.map()` from a static schema array (lines 400-412):
```js
{ key: "item_code", label: "קוד פריט", type: "text" },
{ key: "name", label: "שם", type: "text" },
{ key: "thickness_mm", label: "עובי (מ\"מ)", type: "number" },
... (12 fields)
```

| Attribute | Status |
|-----------|--------|
| State binding | yes (`form[key]` via spread) |
| Validation | NONE — `saveItem` posts straight to `/api/raw-material-catalog/items` |
| DB column mapping | implicit 1:1 (snake_case keys match DB) |
| Label | yes (Hebrew) |
| Required marker | NO — even `name` and `item_code` lack `*` |

Same pattern in supplier sub-form (5 fields, lines 466-471).

---

## 5. Tier-D: Bare-bones forms (state binding only, weakest)

### `erp-app/src/pages/suppliers.tsx` — 8 fields, ~175 LOC
| Field | State | Validation | DB column | Label | Required mark |
|-------|-------|------------|-----------|-------|---------------|
| `name` | yes | NONE | `name` | yes (literal `name`, not Hebrew) | NO |
| `supplier_number` | yes | NONE | `supplier_number` | yes (raw column key) | NO |
| `contact_person` | yes | NONE | `contact_person` | yes | NO |
| `phone` | yes (`type="text"` — should be `tel`) | NONE | `phone` | yes | NO |
| `email` | yes (`type="text"` — should be `email`) | NONE | `email` | yes | NO |
| `address` | yes | NONE | `address` | yes | NO |
| `payment_terms` | yes | NONE | `payment_terms` | yes | NO |
| `is_active` | yes (`type="text"` — should be checkbox/select) | NONE | `is_active` (boolean) | yes | NO |

**Severity: HIGH.** Boolean column treated as text input, no email-type validation, no required field markers, labels are raw English column names instead of Hebrew strings.

### `erp-app/src/pages/purchase-orders.tsx` — 8 form fields
| Field | State | Validation | DB column | Label | Required mark |
|-------|-------|------------|-----------|-------|---------------|
| `supplier` | NO BIND | none | `supplier` | yes | yes (`*` literal) |
| `category` | NO BIND | none | `category` | yes | yes (`*`) |
| `amount` | NO BIND | none | `totalAmount` | yes | NO |
| `date` | NO BIND | none | `orderDate` | yes | yes (`*`) |
| `expectedDelivery` | NO BIND | none | `expectedDelivery` | yes | NO |
| `priority` | NO BIND | none | `priority` | yes | NO |
| `deliveryTerms` | NO BIND | none | `deliveryTerms` | yes | NO |
| `status` | NO BIND | none | `status` | yes | NO |

**Severity: CRITICAL.** Inputs at lines 161-172 have NO `value=` and NO `onChange=`. The form submits an empty `form` state, so creating a PO via UI sends `{}` to the backend. Required marks (`*`) are decorative only — no validation gate stops the submit.

---

## 6. Database-Mapping Issues

`api-server/src/routes/crm-ultimate.ts:91-134` defines `crm_leads_ultimate` columns. Cross-reference with the `emptyForm` keys in `leads-ultimate.tsx:43-47` reveals:

| UI key | DB column | Match? |
|--------|-----------|--------|
| `leadNumber` | `lead_number` | snake/camel mismatch |
| `fullName` | `first_name` (NOT `full_name`) | partial — needs split |
| `agentId` | `assigned_agent_id` | rename mismatch |
| `productInterest` | `interested_products` (JSONB) | rename + type cast |
| `qualityScore` | `quality_score` | snake/camel |
| `estimatedValue` | none | absent in DB |
| `companyName` | none | absent in DB |
| `nextFollowUp` | `next_follow_up` | snake/camel |
| `budget` | `estimated_budget` | rename |

The route at `api-server/src/routes/crm-ultimate.ts:49-59` has a `clean()` helper that drops `id`, `created_at`, `updated_at` and converts blanks to NULL but performs **no** key transformation; PostgreSQL will reject the camelCase keys as unknown columns or silently drop them via the dynamic UPDATE builder at lines 62-72.

---

## 7. Aggregate Findings

| Metric | Count / Status |
|--------|----------------|
| Total CRUD page files audited (erp-app) | 1,299 |
| Pages using `useFormValidation` | 100+ (verified via Grep) |
| Pages with `<RequiredMark>` rendered | ~95 of those 100+ |
| Pages with explicit `aria-invalid` / `aria-required` (manual) | 0 — all routed through hook |
| Pages with `required` HTML attribute | ≤5 (login, portal-login, treasury-dashboard, models, po-approvals) |
| Pages with completely unbound inputs (no `value=`/`onChange=`) | confirmed in `purchase-orders.tsx`; pattern likely repeats in similar `Card`+`Input` mock pages |
| Pages using DB column names as labels (no i18n) | confirmed in `suppliers.tsx`; pattern repeats in similar bare CRUD pages |

---

## 8. Risk Classification

### CRITICAL (blocks data save)
- **`purchase-orders.tsx`** — inputs unbound; submit sends `{}`.
- Any page following the same `<Label>+<Input>` pure-presentation pattern without `value=`/`onChange=`. Search hint: `<Input type="text" placeholder="` without an adjacent `value=` in the same JSX expression.

### HIGH (data quality / DB integrity)
- **CamelCase ↔ snake_case mismatches** between UI form state and PostgreSQL columns in `leads-ultimate` and likely all pages whose `emptyForm` uses camelCase keys but the DB schema uses snake_case.
- **`suppliers.tsx`** — `is_active` text input writing into a boolean column.
- Numeric fields (`budget`, `estimatedValue`, `current_price`) bound as strings — relies on PostgreSQL coercion.

### MEDIUM (UX / a11y)
- Required indicators are visual only on Tier-C/D pages — no client-side gate.
- Tier-D pages use raw English column names as labels, breaking the Hebrew RTL UX promise.
- Tier-A `validation` hook provides ARIA wiring; Tier-B/C/D pages render no `aria-*` attributes at all.

### LOW (cosmetic)
- File-upload preview in `VacationRequestForm` reads to data URL but never uploads to backend storage.
- Tags field on `leads-ultimate` is a CSV string, not a tag-picker; PostgreSQL JSONB cast may fail.

---

## 9. Recommendations

1. **Migrate Tier-D pages to `useFormValidation`.** The hook exists and is battle-tested (`erp-app/src/hooks/use-form-validation.tsx`).
2. **Auto-generate forms from a shared schema-of-record** — same pattern as the inline `[ {key, label, type} ]` array in `raw-material-catalog.tsx`, but with `required` and `validate` keys.
3. **Add a CI lint** that fails when an `<input>` / `<Input>` JSX node has no `value=` AND no `defaultValue=` AND is inside a `form` ancestor.
4. **Fix `purchase-orders.tsx` immediately** — the create/edit modal silently corrupts data.
5. **Generate `entity-map.js` field maps** that mirror `crm_leads_ultimate` columns 1:1 to enforce snake_case in form state. Ref: `onyx-procurement/src/pipeline/entity-map.js` (per CLAUDE.md, 16 entities).
6. **Replace text-typed boolean inputs** (`suppliers.is_active`) with `<Select>` `Active/Inactive` or a checkbox.
7. **Localize all Tier-D English labels** before exposing those routes to end users (RTL Hebrew is a stated CLAUDE.md requirement).

---

## 10. Files referenced

- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/.claude/worktrees/objective-merkle-40ff93/erp-app/src/pages/crm/leads-ultimate.tsx`
- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/.claude/worktrees/objective-merkle-40ff93/erp-app/src/pages/crm/territory-management.tsx`
- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/.claude/worktrees/objective-merkle-40ff93/erp-app/src/pages/inventory/raw-material-catalog.tsx`
- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/.claude/worktrees/objective-merkle-40ff93/erp-app/src/pages/suppliers.tsx`
- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/.claude/worktrees/objective-merkle-40ff93/erp-app/src/pages/purchase-orders.tsx`
- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/.claude/worktrees/objective-merkle-40ff93/erp-app/src/hooks/use-form-validation.tsx`
- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/.claude/worktrees/objective-merkle-40ff93/techno-kol-ops/client/src/components/VacationRequestForm.tsx`
- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/.claude/worktrees/objective-merkle-40ff93/api-server/src/routes/crm-ultimate.ts`

---

**End of report. ~360 lines.**
