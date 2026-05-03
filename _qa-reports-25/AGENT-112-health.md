# AGENT-112 — Health Domain Audit

**Project:** Techno-Kol Uzi ERP 2026 (kobi-el-system-2026)
**Scope:** Clinical Health domain — health_patients, health_appointments, health_prescriptions, health_billing, health_medical_records
**Compliance baseline:** Israeli HIPAA-equivalent (חוק זכויות החולה התשנ"ו-1996, תקנות בריאות הציבור — ועדת הלסינקי, חוק הגנת הפרטיות התשמ"א-1981, תקנות אבטחת מידע התשע"ז-2017), Kupot Holim integration (Clalit/Maccabi/Meuhedet/Leumit), ICD-10 / ICD-11 diagnosis coding
**Date:** 2026-04-29
**Auditor:** Agent 112 — Health Domain
**Working dir:** `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93`

---

## Status

**FAIL — DOMAIN ABSENT.** No clinical Health domain exists in this codebase. The 5 target tables (`health_patients`, `health_appointments`, `health_prescriptions`, `health_billing`, `health_medical_records`) are not defined in any migration, schema, ORM model, route, page, or pipeline module. No PHI/PII handling tier, no Kupot Holim payer integration, no ICD code dictionary, no תיק רפואי model, and no משרד הבריאות compliance posture.

| Check | Result | Severity |
|-------|--------|----------|
| Tables `health_patients` / `health_appointments` / `health_prescriptions` / `health_billing` / `health_medical_records` | **MISSING** in all SQL migrations | CRITICAL |
| Patient (חולה / מטופל) entity in `entity-map.js` | **MISSING** (16 entities, none clinical) | CRITICAL |
| Kupot Holim payer integration (claims / eligibility / 270/271-equiv) | **MISSING** | CRITICAL |
| ICD-10 / ICD-11 dictionary table | **MISSING** | HIGH |
| Prescription / drug dictionary (משרד הבריאות תכשירים, ATC codes) | **MISSING** | HIGH |
| EHR / תיק רפואי append-only ledger with hash chain | **MISSING** | CRITICAL |
| HIPAA-equivalent privacy tier (encryption-at-rest, RLS by patient, audit) | **NOT APPLIED** to clinical data (no clinical data) | CRITICAL |
| Consent / טופס הסכמה מדעת capture | **MISSING** | HIGH |
| Helsinki Committee (ועדת הלסינקי) workflow | **MISSING** | HIGH |
| Drug-drug interaction (DDI) check engine | **MISSING** | HIGH |
| Lab result (LOINC / משרד הבריאות) ingest | **MISSING** | MEDIUM |
| Provider / רופא registry (מספר רישום משרד הבריאות) | **MISSING** | HIGH |

---

## What is in the codebase under the word "health"

The word "health" appears in 5 places, **none clinical**:

| File | Purpose | Clinical? |
|---|---|---|
| `onyx-procurement/src/bl/health-insurance.js` | Israeli National Health Insurance (דמי ביטוח בריאות) — payroll deduction calculator under חוק ביטוח בריאות ממלכתי התשנ"ד-1994. Tracks קופת חולים assignment (Clalit 01 / Maccabi 02 / Meuhedet 03 / Leumit 04) for BL filing only. **Not patient care.** | No |
| `erp-app/src/pages/hr/health-safety.tsx` | HR workplace safety — incidents (slip/fall, machinery, fire, chemical), severity scale, training compliance per תקנות הבטיחות בעבודה. **Not patient care.** | No |
| `onyx-procurement/src/ops/health-check.js`, `dep-health.js`, `devops/health-orchestrator.js` | DevOps liveness / readiness probes for service uptime. **Not patient care.** | No |
| `onyx-procurement/src/customer/health-score.js` | Customer success "health score" (CRM churn risk). **Not patient care.** | No |
| `erp-app/src/pages/executive/company-health.tsx` | Executive KPI dashboard — categorical company health (פיננסי / תפעולי / אנושי / לקוחות / טכנולוגי). **Not patient care.** | No |

The single non-trivial use of `קופת חולים` is `HEALTH_FUNDS` in `health-insurance.js:135-160` — a static lookup of the 4 BL fund codes for payroll. There is **no claims submission, no member eligibility check, no EDI/XML payer integration, no benefit lookup**.

---

## Entity Map gap

`onyx-procurement/src/pipeline/entity-map.js` defines exactly 16 entities:
`lead, customer, supplier, quote, rfq, po, project, work_order, invoice, employee, contract, material, payment, task, document, alert`.

There is **no** `patient`, `appointment`, `prescription`, `medical_record`, `claim`, `encounter`, `provider`, `episode_of_care`, or `lab_result`. The system is procurement / project / workforce — not a clinical or healthcare ERP.

---

## SQL migrations — full inventory

**`onyx-procurement/db/migrations/`:**
- `0001_init_extensions_and_core.sql` — pgcrypto, citext, base tenant tables
- `0002_suppliers_and_contacts.sql`
- `0003_purchase_orders.sql`
- `0004_invoices_and_payments.sql`
- `0005_audit_trail.sql`

**`onyx-procurement/supabase/migrations/`:** 7 files covering bootstrap, schema, seed, VAT, annual tax, bank reconciliation, payroll wage slip.

**`onyx-procurement/migrations/`:** 1 file — perf indexes only.

Searched for `health_patients`, `health_appointments`, `health_prescriptions`, `health_billing`, `health_medical_records` across every `*.sql` in the worktree — **zero hits.** No `patient` or `appointment` table under any name. No HL7, FHIR, ICD, LOINC, ATC, NDC, RxNorm, or SNOMED reference data.

---

## Israeli HIPAA-equivalent gap

A clinical implementation in Israel must satisfy:

1. **חוק זכויות החולה התשנ"ו-1996 (Patients' Rights Law, 1996)** — informed consent (סעיף 13), confidentiality (סעיף 19), right to access medical record (סעיף 18), right to second opinion. **Not modeled.**
2. **חוק הגנת הפרטיות התשמ"א-1981 + תקנות אבטחת מידע 2017** — registered database notification (רישום מאגר מידע), access logging, data subject rights (sections 13/13a), 4 security tiers (basic / medium / high / very high) — clinical data is **at minimum "high"** (`רמת אבטחה גבוהה`), often "very high" (`רמה גבוהה במיוחד`) requiring HSM, segmented network, biennial penetration tests. **Not applied.**
3. **חוזרי משרד הבריאות** — תיק רפואי ממוחשב (computerized medical record) standards, איסוף ועיבוד מידע רפואי, הסכמה מדעת template format. **Not modeled.**
4. **ועדת הלסינקי (Helsinki Committee)** — required for any research use of patient data. No workflow exists.
5. **משרד הבריאות מסדי-מידע** — provider registry (מספר רישום רופא), pharmacy registry, drug formulary (תכשיר רפואי). **Not integrated.**
6. **Retention** — clinical records: minimum 25 years from last entry (תקנות בריאות העם — רישומים), some categories permanent. **No retention policy exists.**
7. **Cross-border transfer** — תקנות הגנת הפרטיות (העברת מידע למאגרי מידע שמחוץ לגבולות המדינה) restricts PHI export. **Not enforced.**

---

## Kupot Holim integration gap

Required interfaces for any real clinical billing module:

| Interface | What it does | Implemented? |
|---|---|---|
| **בדיקת זכאות (eligibility check)** | Real-time member coverage / סל הבריאות / supplemental tier verification per קופה | NO |
| **טופס 17 (Form 17 / referral)** | Specialist authorization from primary care | NO |
| **תביעה / Claim submission** | Service rendered → fund reimbursement (per קופה schema; Clalit & Maccabi differ) | NO |
| **מרשם דיגיטלי (digital prescription)** | Send Rx to pharmacy chain via משרד הבריאות gateway | NO |
| **מאגר תרופות לסל** | Drug-in-basket lookup for copay calculation | NO |
| **מרפאות הקופה** | Clinic / provider directory per fund | NO |
| **EDI / XML payer protocols** | Each קופה publishes its own. None implemented. | NO |

The `HEALTH_FUNDS` constant in `health-insurance.js` is the **only** place fund codes appear, and only for BL Form 102/126 wage-slip payroll — a one-way classification with no API, no file, no claim.

---

## ICD coding gap

- No `icd10`, `icd11`, `diagnosis_codes`, or `medical_codes` table
- No drug code table (ATC, ATC-DDD, רישום משרד הבריאות `RX-` prefix)
- No procedure code table (CPT-equivalent or קודי קופות החולים)
- No lab code table (LOINC)
- No body site / anatomy ontology
- No clinical NLP extractor

**Consequence:** even if patient tables existed, diagnosis would be free-text Hebrew with no normalization, no epidemiology rollup, no quality metric (HEDIS-equivalent), no claims-grade billable code.

---

## Recommended next steps (out of scope for this audit, for delivery planning)

If clinical Health is genuinely required for this ERP (currently nothing in `CLAUDE.md`, the Master Flow, or the 5 business flows references it):

1. **Confirm domain need** — current architecture (Lead → Quote → Project → PO → Invoice) does not contain a clinical encounter pathway. Adding Health would be a new top-level service equivalent to `ONYX_HEALTH` parallel to `ONYX_PROCUREMENT` — not a sub-module.
2. **Build new service** `health-clinical/` with its own port and its own DB schema (`health_*` namespace), isolated from operational/procurement DB to satisfy Privacy Law tier-high segregation.
3. **Schema** (minimum viable):
   - `health_patients` (PII separated, FK → `kupot_holim_member` with eligibility cache)
   - `health_providers` (מספר רישום משרד הבריאות)
   - `health_appointments` (slot, provider_id, patient_id, status, no-show flag)
   - `health_encounters` (visit envelope, ICD codes JSONB, vitals)
   - `health_prescriptions` (ATC/RX code, dose, refills, e-Rx hash chain)
   - `health_medical_records` (append-only, SHA-256 chain per patient like `audit_trail`)
   - `health_billing` (claim → payer → status with EDI envelope)
   - `health_consent` (טופס הסכמה, scoped, revocable, time-bounded)
4. **Compliance scaffold** — encrypt-at-rest with patient-scoped DEK, RLS per patient_id + per provider scope, tamper-evident audit log (Merkle/hash chain), 25-year retention policy, breach notification (תקנה 11 הודעה על אירוע אבטחה) workflow.
5. **Reference dictionaries** — load ICD-10-IL (משרד הבריאות תרגום), ATC, LOINC; integrate with Kupot Holim eligibility APIs (4 separate vendor endpoints).
6. **Add 360 page contracts** for `Patient360`, `Encounter360`, `Provider360` matching the ERP's existing 9-page master pattern.
7. **State machines** for `appointment` (scheduled → confirmed → arrived → in_progress → completed | no_show | cancelled) and `prescription` (drafted → signed → dispensed → refilled | discontinued).

---

## Findings summary

- **Severity: CRITICAL.** The Health domain as scoped (Israeli HIPAA-equivalent, Kupot Holim, ICD codes, 5 specified tables) is **completely absent** from the codebase.
- The only "health" code is **payroll-side National Health Insurance**, which shares 4 קופת חולים codes with the requested domain but has no clinical, billing, or PHI surface.
- No remediation possible within an audit — this is a **greenfield build**, not a fix. Recommend either (a) confirming Health is out of scope for v1 of Techno-Kol Uzi ERP and removing from any planning artifact, or (b) opening a separate epic for `ONYX_HEALTH` as a new service per the existing 4-service architecture pattern.

**Verdict: NOT IMPLEMENTED.**
