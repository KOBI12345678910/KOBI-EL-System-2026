# AGENT-237 — Health Domain DDL Delivery

**Project:** Techno-Kol Uzi ERP 2026 (kobi-el-system-2026)
**Scope:** Author DDL for clinical Health domain flagged MISSING by Agent 112
**Deliverable:** `supabase/migrations/00077_health_domain.sql`
**Compliance baseline:** Israeli HIPAA-equivalent (חוק זכויות החולה התשנ"ו-1996, חוק הגנת הפרטיות התשמ"א-1981 + תקנות אבטחת מידע התשע"ז-2017, תקנות בריאות העם, חוק ביטוח בריאות ממלכתי התשנ"ד-1994, חוק חתימה אלקטרונית התשס"א-2001)
**Date:** 2026-04-29
**Author:** Agent 237 — Health DDL
**Working dir:** `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93`
**Predecessor:** Agent 112 (`AGENT-112-health.md`) — confirmed FAIL/DOMAIN ABSENT

---

## Status

**DDL DELIVERED — RUNTIME OUT OF SCOPE.** A standalone schema file `00077_health_domain.sql` was authored and placed alongside existing `00053..00071` migrations. It creates the 5 target tables with full status lifecycles, hash-chained EHR, payer-claim coverage, and tier-`גבוה במיוחד` RLS scaffolding. **No service code, no API, no UI** — those belong to a separate **ONYX_HEALTH** service (recommended, see Architectural Note below).

| Deliverable | Result |
|---|---|
| `supabase/migrations/00077_health_domain.sql` | CREATED, idempotent |
| 5 target tables (patients / appointments / prescriptions / billing / medical_records) | All present with comments in Hebrew + English |
| HIPAA-equivalent controls (encryption fields, hash chain, append-only, RLS, anon revoke) | INCLUDED at DDL layer |
| Service split recommendation (ONYX_HEALTH @ 3400 / `/health`) | DOCUMENTED in file header + below |
| Out of scope (intentionally) | runtime, edge functions, business logic, FHIR mapping, drug dictionary seed |

---

## Architectural Recommendation — ONYX_HEALTH (separate service)

Per the 4-service map in `CLAUDE.md`, the health domain should NOT live inside ONYX_PROCUREMENT. Reasons:

1. **Data segregation under תקנות אבטחת מידע 2017 § 17** — clinical PHI is security tier `גבוה במיוחד` (very high). It must not share an event bus, cache layer, or backup tier with procurement (tier `בינוני`).
2. **Distinct retention policy** — `סעיף 18 חוק זכויות החולה`: medical record kept 7y for adults, until age 25 for minors, lifetime for psychiatric. Procurement records are 7y under פקודת מס הכנסה. Mixing them in one backup window is an audit landmine.
3. **Distinct authn surface** — prescriptions need digital signature under `חוק חתימה אלקטרונית התשס"א-2001`; biometric for controlled substances. Procurement signs invoices via PDF stamp — different trust chain.
4. **Distinct RLS model** — patient↔provider relationship is more granular than tenant↔user. Mixing predicates in one schema bloats every clinical query.

| Proposed service | Port | Mount | Notes |
|---|---|---|---|
| **ONYX_HEALTH** | 3400 | `/health` | New service. Owns `health.*` schema. Speaks FHIR R4 outbound, HL7 v2 to LIS/RIS. |

The 5-service updated map: `TECHNO_KOL_OPS:3200`, `ONYX_PROCUREMENT:3100`, `PAYROLL_AUTONOMOUS:5173`, `ONYX_AI:3300`, **`ONYX_HEALTH:3400`**.

---

## Tables created

| Table | Hebrew | Rows of intent |
|---|---|---|
| `health.patients` | מטופלים | Identity (national_id stored as salted SHA-256 hash + last4), contact (encrypted bytea), Kupat Holim membership, allergies, chronic conditions, consent + Helsinki status, status lifecycle (active/inactive/deceased/merged/redacted) |
| `health.appointments` | תורים / ביקורים | Appointment + encounter (10 types), 9-state lifecycle, ICD/CPT codes, vitals, copay, cancellation reason |
| `health.prescriptions` | מרשמים | Drug (name + ATC), dose/frequency/route, DDI screening status, controlled-substance schedule, digital signature hash, 7-state lifecycle, refills tracking |
| `health.billing` | חיוב רפואי / תביעות | Payer (kupat_holim/private/self_pay/workers_comp/mvajot/sal_mashlim), CPT + ministry proc code, 9-state claim status, charge/allowed/paid breakdown |
| `health.medical_records` | תיק רפואי | 14 record types, encrypted body + plaintext SHA-256 hash, hash-chained ledger (`prev_record_id` + `hash_chain`), append-only trigger, sensitivity tiers (standard/sensitive/very_sensitive/sealed), retention class (adult_7y/minor_until_25/psych_lifetime/permanent) |

All 5 follow the canonical column set from `00053..00065`: `id bigserial pk`, `public_id uuid`, `<entity>_code text unique`, `is_active`, `is_deleted`, `created_at`, `updated_at`, `created_by`, `updated_by`, `tenant_id`, `metadata jsonb`.

---

## HIPAA-equivalent controls included

| Control | Where in DDL | Israeli law anchor |
|---|---|---|
| National ID never stored in plaintext | `patients.national_id_hash` (SHA-256 + salt) + `patients.national_id_last4` (display only) | תקנות הגנת הפרטיות (אבטחת מידע) 2017 — `מאגר מידע ברמה גבוהה במיוחד` |
| Contact PHI encrypted at column level | `phone_e164_enc`, `email_enc`, `address_enc` declared `bytea` (pgp_sym_encrypt or KMS-wrapped) | תקנות אבטחת מידע סעיף 17 |
| Append-only medical record | `medical_records` with `medrec_immutable_guard()` trigger blocking UPDATE on body/hash/signature and DELETE entirely | סעיף 18 חוק זכויות החולה (right to record integrity) |
| Tamper-evident hash chain | `medical_records.body_hash` + `hash_chain` = SHA-256(prev.hash_chain ‖ body_hash ‖ signed_at) | סעיף 17 חוק זכויות החולה (data integrity) |
| Amendments preserve history | `amendment_of` self-FK on medical_records — corrections create new row, never overwrite | סעיף 18(ה) חוק זכויות החולה |
| Digital signature for prescriptions | `prescriptions.signature_hash` + `signed_at` | חוק חתימה אלקטרונית התשס"א-2001 |
| Drug-drug interaction gate | `prescriptions.ddi_check_status` + `ddi_warnings` | תקנות הרוקחים — חובת בדיקת אינטראקציות |
| Controlled-substance schedule flag | `prescriptions.controlled_substance` (`schedule_1..3`, `psychotropic`) | פקודת הסמים המסוכנים |
| Helsinki Committee status | `patients.helsinki_status` (not_required/pending/approved/rejected/expired) | תקנות בריאות העם — ועדת הלסינקי |
| Informed consent capture | `patients.consent_signed_at`, `consent_version`, `consent_document_id` | סעיף 13 חוק זכויות החולה |
| Data-subject opt-out | `patients.data_subject_optout` flag | סעיף 13 חוק הגנת הפרטיות |
| Sensitivity tiering | `medical_records.sensitivity_level` (standard/sensitive/very_sensitive/sealed) + `break_glass_only` | תקנות בריאות הנפש; חוק נפגעי תקיפה מינית |
| Retention by patient class | `medical_records.retention_class` (`adult_7y` / `minor_until_25` / `psych_lifetime` / `permanent`) + `purge_after` date | סעיף 18(ב) חוק זכויות החולה |
| RLS enabled + forced + anon revoked | `enable row level security` + `force row level security` on all 5 tables; `revoke all … from anon` | תקנות אבטחת מידע סעיף 9 (בקרת גישה) |
| Court-ordered redaction path | `medical_records.status = 'redacted_by_court'` (deletion still blocked) | פסיקת בית משפט; חוק חופש המידע |
| Patient merge audit trail | `patients.merged_into_patient_id` self-FK | סעיף 18(ג) — distinct medical histories preserved |

---

## What is intentionally NOT included

This file is DDL only. The following belong to ONYX_HEALTH service work:

- **Drug dictionary seed** (משרד הבריאות תכשירים, ATC index) — too large for a migration, ingested by service at boot
- **ICD-10/11, LOINC, SNOMED, CPT reference tables** — same reason; vendored as JSON / ETL
- **Provider registry** (`health.providers` with מספר רישום משרד הבריאות) — separate migration before ONYX_HEALTH go-live
- **Clinic / location master** — same
- **Lab orders, lab results, imaging** — phase 2 (LIS/RIS integration)
- **Kupat Holim claim file generation** (270/271-equiv XML, חוזרי מנכ"ל) — service-level
- **FHIR R4 resource mapping** — service-level
- **NLQ / AI summary of medical record** — ONYX_AI service
- **Patient portal (PHR)** — UI work, served via TECHNO_KOL_OPS reverse proxy to ONYX_HEALTH
- **Tenant-aware patient↔provider RLS predicates** — baseline policies are scaffolding; ONYX_HEALTH must layer fine-grained policies (provider's panel, break-glass with audit)
- **Encryption-at-rest key management** — KMS / pgsodium / Supabase Vault wiring is infra-level, not DDL
- **Pseudonymization / K-anonymity for research export** — separate `health.research_views` later

The migration leaves correctly typed `bytea` columns and trigger hooks where these will plug in.

---

## Idempotency / safety

Every statement in `00077_health_domain.sql` is rerunnable:

- `create schema if not exists`
- `create extension if not exists pgcrypto, citext`
- `create table if not exists` for all 5 tables
- `create index if not exists` on all 22 indexes
- `do $$ begin … exception when duplicate_object then null; end$$` around each `create policy`
- `drop trigger if exists … create trigger …` for both update_at and immutability guards
- `revoke` is naturally idempotent

No destructive `drop table`, no `truncate`, no data writes.

---

## File integrity check

| File | Path | Lines (approx) |
|---|---|---|
| Migration | `supabase/migrations/00077_health_domain.sql` | ~360 |
| This report | `_qa-reports-25/AGENT-237-health-ddl.md` | ~200 |

Migration sits between `00071_remove_dangerous_anon_read_policies.sql` (last numbered file) and `20260417000000_initial_schema.sql` (timestamp-named bootstrap). Numerical gap `00072..00076` is intentional — reserved for any prior work the user runs ahead.

---

## Recommended next steps (NOT in this PR)

1. **Spin up ONYX_HEALTH service** — port 3400, mount `/health`, own `health.*` schema. Add row to wiring-spec.js.
2. **Authoring `entity-map.js`** — add `patient`, `appointment`, `prescription`, `medical_record`, `claim` entities with their 360-page contracts.
3. **State machines** for the 4 lifecycles defined in CHECKs (appointment, prescription, billing claim, medical record status). Add to `state-machines.js`.
4. **6th workflow flow** — `Patient → Appointment → Encounter → Prescription/Procedure → Billing → Claim → Payment` — add to `workflow-flows.js`.
5. **Reference data migration** — drug dictionary (ATC), ICD-10/11, LOINC, CPT, ministry procedure codes. Probably 5 separate migrations: `00078_health_dict_atc.sql` … `00082_health_dict_cpt.sql`.
6. **Provider + clinic master** — `00083_health_providers.sql`, `00084_health_clinics.sql`.
7. **Patient360 / Appointment360 / Prescription360 / MedicalRecord360 / Claim360 pages** — bring health into the Master 360 set (raising the count from 9 to 14).
8. **Encryption key management** — wire pgsodium or Supabase Vault to the `*_enc bytea` columns; provide `health.decrypt_*` SECURITY DEFINER functions with audit logging.
9. **Break-glass audit table** — `health.access_log` with `actor_id, patient_id, accessed_at, justification, ip` — required before any production PHI lands.
10. **Helsinki workflow** — research protocol approval, IRB membership, study enrollment, consent withdrawal.

---

## Audit signoff

| Item | Verdict |
|---|---|
| Tables present in the migration file | 5 / 5 |
| HIPAA-equivalent surface at DDL layer | Present (encryption columns, hash chain, append-only, RLS forced, anon revoked) |
| File idempotent | Yes |
| Service split documented | Yes (ONYX_HEALTH) |
| Within line budget (<400) | Yes |
| Domain readiness for production | **NO — runtime, key-mgmt, RLS predicates, dictionaries still required.** This DDL is the foundation, not the system. |

Agent 237 — DDL phase complete. Hand off to whichever agent owns ONYX_HEALTH service bootstrap.
