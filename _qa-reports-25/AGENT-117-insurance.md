# AGENT-117 — Insurance Domain Audit

**Project:** Techno-Kol Uzi ERP 2026
**Date:** 2026-04-29
**Scope:** Insurance backbone — `ins_policies`, `ins_claims`, `ins_quotes`; PMI (רשות שוק ההון, ביטוח וחיסכון), IISA reports, premium calculations
**Verdict:** **FAIL — Insurance domain effectively absent.** Three UI pages exist as isolated CRUD shells with hard-coded fallback data; **none of the three target tables (`ins_policies`, `ins_claims`, `ins_quotes`) exist** in the schema, no backend routes are mounted, no premium calculator is implemented, and there is **zero PMI / IISA regulatory coverage**. What is wired is `national_insurance` / `health_insurance` (Bituach Leumi payroll deductions) — that is workforce, not the insurance vertical.

---

## 1. Tables — `ins_policies`, `ins_claims`, `ins_quotes`

| Table | Drizzle schema (`lib-client/db/src/schema/`) | Supabase migration | Search hits |
|-------|-----------------------------------------------|--------------------|-------------|
| `ins_policies` | **NOT FOUND** | **NOT FOUND** in `00000_master_schema.sql` … `00071_*` | 0 |
| `ins_claims`   | **NOT FOUND** | **NOT FOUND** | 0 |
| `ins_quotes`   | **NOT FOUND** | **NOT FOUND** | 0 |

Grep `ins_polic|ins_claim|ins_quote` against `supabase/` and `lib-client/db/` → 0 matches. No `CREATE TABLE` for any of the three exists anywhere in the worktree.

**Adjacent table that exists:**
- `compliance.policies` (`00010_enterprise_expansion_30_tables.sql:193`) — *information-security policies + acknowledgements*, **not insurance policies**.
- `documents` rows tagged `'insurance_certificate'` (`api-server/src/routes/ai-document-intelligence-engine.ts:146`) — only OCR classification, no structured policy data.
- `contracts` row seeded as `'CON-2026-006' / type='insurance' / counterparty='הראל ביטוח'` (`api-server/src/seed-data.ts:228`) — single demo contract, not a domain.

There is **no insurance schema** (no `insurance.*`, no `ins_*`, no `policies`/`claims`/`quotes` under any namespace).

---

## 2. UI Pages (3) — present but unwired

| Page | File | Route | Backend endpoint | Backend exists? |
|------|------|-------|------------------|-----------------|
| Equipment Insurance | `erp-app/src/pages/assets/equipment-insurance.tsx` (419 LOC) | `/assets/insurance` (also `/assets/equipment-insurance` in menu seed) | `GET /api/assets/equipment_insurance` | **NO** |
| Contractor Insurance | `erp-app/src/pages/hr/contractor-insurance.tsx` (186 LOC) | `/hr/contractor-insurance` | `/api/hr/contractor-insurance` (GET/POST/PUT/DELETE) | **NO** |
| Import Insurance | `erp-app/src/pages/import/import-insurance.tsx` (205 LOC) | `/import/insurance` | `/api/import-insurance` (GET/POST/PUT/DELETE) | **NO** |

Verified via Grep on `api-server/src/routes/`: zero files match `insur|polic|claim`. The `authFetch` calls in these pages will 404. None of the three pages mounts a route in `api-server/src/app.ts`.

### Hard-coded fallback data
`equipment-insurance.tsx` ships 8 `FALLBACK_POLICIES`, 5 `FALLBACK_CLAIMS`, 4 `FALLBACK_COVERAGE_GAPS`, 5 `FALLBACK_RENEWAL_SCHEDULE` arrays directly in the component (lines 16-48). Insurer values are typed as Hebrew strings (`"הראל"`, `"מגדל"`, `"כלל"`, `"הפניקס"`) — no FK to a `suppliers` row, no carrier registry. Demonstrates the page can render in isolation but has no DB roundtrip.

`contractor-insurance.tsx` has KPI tiles entirely hard-coded JSON (line 82): `[{"l":"פוליסות","v":"48"}, {"l":"כיסוי כולל","v":"₪28M"}, …]`. Numbers are decoration, not aggregates.

### CRUD wiring quality
`import-insurance.tsx`: `handleSave`/`handleDelete` exist and POST/PUT/DELETE to `/api/import-insurance/:id`, but the create modal (lines 155-176) has every `<Input>` and `<select>` rendered **without `value=`/`onChange=` bindings** — there is no `setForm`/state plumbing on the form fields. A user can fill the modal and click "שמור" but `form` state stays `{}`, so the POST body is empty. Same pattern in `contractor-insurance.tsx` create modal (only the policyNumber/contractor fields ever feed form state).

`equipment-insurance.tsx` is read-only — the "פוליסה חדשה" button (line 119) has no onClick handler.

---

## 3. Israeli regulatory coverage — **none**

### PMI (רשות שוק ההון, ביטוח וחיסכון)
- Grep `רשות שוק ההון|capital market|pmi|PMI` (regulator-specific) → **0 hits in source**. The five hits for "PMI" are all `package-lock.json` artifacts (NPM module names like `cmc`/random tokens) — not regulator references.
- No directives implementation: no חוזר ביטוח (PMI circulars), no טיוטות חוזרי גוף מוסדי, no דוחות כספיים רבעוניים to PMI, no דוח גילוי לציבור.
- No representative-license / license tier metadata on user/agent records.

### IISA (איגוד חברות הביטוח בישראל) reports
- Grep `IISA|איגוד חברות הביטוח` → **0 hits**.
- No שאלון מקדים, no טופס הצעה standardized to IISA template, no שאלון בריאות.
- No בקשת תביעה (claim form) standardization; `equipment-insurance.tsx` `FALLBACK_CLAIMS` carries `id, policy, description, date, amount, approved, status` only — no IISA-required fields (date of loss, place, third-party, police case #, immediate notice timestamp).

### Premium calculations
- Grep `premium.*calc|calc.*premium|פרמיה.*חישוב` → **0 hits**.
- The string `premium` appears 25 files but every hit is one of:
  - **Payroll** Bituach Leumi rates (`api-server/src/constants.ts`, `israeli-payroll-engine.ts`) — different domain.
  - **Salary premium** (175%/200% Shabbat/holiday in `AGENT-186-time-tracking.md:130`).
  - **Brand/SKU "premium tier"** strings.
- No actuarial table, no risk-class lookup, no rating factor matrix, no `getPremium(policy, insured, factors)` function. Premium values in UI fallbacks are static numbers.
- No deductible logic (`השתתפות עצמית`): the import-insurance modal has a deductible *input field* (line 165) but no calculation, no link to claim pay-out logic.
- No reinsurance / retention layers, no co-insurance, no commission engine.

### Claim lifecycle
No claim state machine. `onyx-procurement/src/pipeline/state-machines.js` has 13 machines (lead, quote, order, project, work-order, PO, invoice, payment, …) — **insurance/claim is not one of them.** No transitions like `notified → assigned_adjuster → assessed → approved/denied → paid → closed`. Status values in the UI (`"בתוקף" / "פג תוקף" / "לחידוש קרוב" / "אושר" / "בבדיקה" / "נדחה"`) are free text in JSX, not enum-bound.

### Policy renewal automation
Three statuses in `equipment-insurance.tsx` `FALLBACK_RENEWAL_SCHEDULE` (`"פג תוקף"`, `"לחידוש קרוב"`, `"תקין"`) computed from a static `daysLeft` field. No cron / scheduler, no notification, no `policies_expiring_soon` view.

---

## 4. Pipeline / wiring spec coverage

`onyx-procurement/src/pipeline/`:
- `entity-map.js` — 16 entities. `insurance` / `policy` / `claim` / `premium` ⇒ **0 hits.** Insurance is not a first-class entity.
- `wiring-spec.js` — no Insurance360 page contract, no insurance route group, no insurance action→API mappings.
- `state-machines.js` — 13 machines, none for claims.
- `orchestrator.js` — single hit on `policy` is a `'policy_requires'` flag for a *contract* create step (line 69), unrelated to insurance.
- `workflow-flows.js` — 5 business flows (Sales→…→Cash, Employee→Payroll). No claims-handling flow.

**Insurance is not modelled in the pipeline at all.** Per the No Dead Pages rule in `CLAUDE.md`, the three UI pages currently fail every required answer (Where am I? What is this? Status? What can I do? Next step? Related records?).

---

## 5. Menu wiring

`supabase/migrations/00035_app_menu_FULL.sql:478` — `('Health Insurance', '/bl/health-insurance', '•', 16, 36)` — pointer to a non-existent business-logic page (BL prefix). `00067_deactivate_dead_menu_items.sql:477` correctly **deactivates** `/bl/health-insurance` — confirming it was a stub.

`00038_merged_sources_menu_additions.sql:170` adds `('Equipment Insurance', '/assets/equipment-insurance', '🚗', …)` — the only insurance menu item that resolves to a real (frontend-only) page.

No menu items for the import-insurance or contractor-insurance routes. Both pages are reachable only by direct URL.

---

## 6. Data examples actually present

| Source | Type | Notes |
|--------|------|-------|
| `api-server/src/seed-data.ts:228` | `contracts` row, type=`insurance`, counterparty=`הראל ביטוח` | 1 row |
| `api-server/src/seed-data.ts:341` | `documents` row, type=`insurance` (פוליסת אחריות מקצועית 2026 PDF) | 1 row |
| `api-server/src/routes/ai-document-intelligence-engine.ts:146` | OCR classifier mapping `insurance_certificate → compliance/insurance_certificates` | classifier only — target table `insurance_certificates` is not defined in any migration |
| `api-server/src/routes/ai-document-processor.ts:70-71` | Hebrew→English doc category map: `"ביטוח"→"Insurances"`, `"פוליסה"→"Insurances"` | folder routing only |

There is no `policies`, `policy`, `claims`, `claim`, `quotes`, `premiums`, `risk_classes`, `coverages`, `endorsements`, `riders`, `beneficiaries`, `actuarial_*`, or `insurer_*` table anywhere.

---

## 7. Recommendations (P0 → P2)

**P0 — schema (block all UI work until done):**
1. Create migration `0007X_insurance_domain.sql` with at minimum: `ins_carriers`, `ins_policies`, `ins_coverages`, `ins_endorsements`, `ins_quotes`, `ins_claims`, `ins_claim_events`, `ins_premium_payments`, `ins_documents`. Add RLS policies (mirror pattern from `00071_remove_dangerous_anon_read_policies.sql`).
2. Add Drizzle schemas under `lib-client/db/src/schema/insurance-*.ts`.
3. Add a Claim state machine to `state-machines.js` (`reported → registered → assigned → assessed → approved|denied → paid → closed`, plus `re_opened`, `subrogation`).

**P0 — backend:**
4. `api-server/src/routes/insurance/{policies,claims,quotes,carriers}.ts` mounted in `app.ts`.
5. `services/premium-calculator.ts` with risk-class table, factor matrix, deductible/co-pay/co-insurance pure functions, plus unit tests.
6. Wire all three existing UI pages to the new endpoints; remove `FALLBACK_*` arrays.

**P1 — Israeli regulatory:**
7. PMI compliance module: דוח לציבור export, חוזר ביטוח acknowledgement registry, license-tier metadata on agent users.
8. IISA standard claim form (טופס תביעה אחיד) renderer + ingestion.
9. Annual policyholder report generator (טופס חידוש).
10. Renewal scheduler (`pg_cron` job + notification on `policies` where `end_date - now() ≤ 60 days`).

**P1 — UX bugs already present:**
11. Fix unbound form fields in `import-insurance.tsx` create modal (lines 159-168) — every `<Input>`/`<select>` needs `value`/`onChange` plumbing into `form` state, otherwise saves are silently empty.
12. Wire "פוליסה חדשה" button in `equipment-insurance.tsx:119`.
13. Convert hard-coded KPI JSON in `contractor-insurance.tsx:82` to derived aggregates.

**P2:**
14. Insurance360 page contract in `wiring-spec.js`; promote `policy` to first-class entity in `entity-map.js`.
15. Reinsurance, retention and commission engines.

---

## 8. File index (relevant)

- `erp-app/src/pages/assets/equipment-insurance.tsx`
- `erp-app/src/pages/hr/contractor-insurance.tsx`
- `erp-app/src/pages/import/import-insurance.tsx`
- `erp-app/src/routes/{hr-routes,procurement-routes,other-routes}.tsx` (mount the three pages)
- `supabase/migrations/00035_app_menu_FULL.sql:478` (dead `/bl/health-insurance`)
- `supabase/migrations/00038_merged_sources_menu_additions.sql:170` (`/assets/equipment-insurance` menu)
- `supabase/migrations/00067_deactivate_dead_menu_items.sql:477` (deactivates `/bl/health-insurance`)
- `api-server/src/seed-data.ts:228,341` (sole insurance-typed seed rows)
- `api-server/src/routes/ai-document-intelligence-engine.ts:146,270`
- `api-server/src/routes/ai-document-processor.ts:70-71`
- `onyx-procurement/src/pipeline/{entity-map,state-machines,wiring-spec,workflow-flows,orchestrator}.js` — Insurance unmodelled in all five.

**Bottom line:** The Insurance domain has UI scaffolding but no schema, no backend, no premium logic, no regulator coverage, and no pipeline modelling. Treat current state as a P0 spec gap — three React pages do not constitute a domain.
