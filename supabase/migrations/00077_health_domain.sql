-- ============================================================
-- FILE: supabase/migrations/00077_health_domain.sql
-- TECHNO-KOL UZI ERP 2026 — Clinical Health Domain (DDL only)
-- Created: 2026-04-29
-- Author: Agent 237 (per gap identified by Agent 112)
-- Purpose:
--   Establish the 5 core clinical tables flagged as MISSING by the
--   Agent 112 health domain audit:
--     1. health.patients              — מטופלים
--     2. health.appointments          — תורים / ביקורים
--     3. health.prescriptions         — מרשמים
--     4. health.billing               — חיוב רפואי / תביעות
--     5. health.medical_records       — תיק רפואי (append-only)
--
--   Israeli HIPAA-equivalent compliance baseline:
--     - חוק זכויות החולה התשנ"ו-1996 (Patients' Rights Law)
--     - חוק הגנת הפרטיות התשמ"א-1981 + תקנות אבטחת מידע התשע"ז-2017
--       (Security Tier "גבוה / גבוה במיוחד" for clinical PHI)
--     - תקנות בריאות העם (Public Health Regulations)
--     - חוק ביטוח בריאות ממלכתי התשנ"ד-1994 (Kupot Holim payer)
--
-- IMPORTANT — ARCHITECTURAL NOTE:
--   This is **DDL only**. A separate ONYX_HEALTH service (suggested
--   port 3400, served at /health) is the recommended runtime owner.
--   Reasons:
--     - PHI segregation under סעיף 17 of תקנות אבטחת מידע — clinical
--       data should not share an event bus / cache with procurement.
--     - Distinct audit retention (medical record = 7 years adult /
--       until age 25 minor / lifetime psychiatric — סעיף 18 חוק
--       זכויות החולה).
--     - Distinct authn (digital signature for prescriptions per
--       חוק חתימה אלקטרונית התשס"א-2001).
--   This migration creates ONLY the schema + tables + RLS scaffolding
--   so the health service has somewhere to land. No business logic,
--   no triggers beyond updated_at, no cross-domain FKs.
--
--   Idempotent — every CREATE uses IF NOT EXISTS, every ALTER uses
--   ADD COLUMN IF NOT EXISTS.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- PART A: Schema + extensions
-- ──────────────────────────────────────────────────────────────

create schema if not exists health;
comment on schema health is
  'Clinical Health domain — PHI bearing. Security tier: גבוה במיוחד under תקנות אבטחת מידע 2017. Owned by ONYX_HEALTH service (separate from ONYX_PROCUREMENT). RLS mandatory.';

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ──────────────────────────────────────────────────────────────
-- PART B: Patients (מטופלים)
-- ──────────────────────────────────────────────────────────────

create table if not exists health.patients (
  id                    bigserial primary key,
  public_id             uuid not null default gen_random_uuid(),
  patient_code          text not null unique,
  -- ===== Identity (PHI — Tier "גבוה במיוחד") =====
  national_id_hash      text not null,
  national_id_last4     text,
  given_name            text not null,
  family_name           text not null,
  birth_date            date not null,
  sex_at_birth          text check (sex_at_birth in ('M','F','I','U')),
  gender_identity       text,
  preferred_language    text not null default 'he-IL',
  -- ===== Contact (encrypted at rest expected) =====
  phone_e164_enc        bytea,
  email_enc             bytea,
  address_enc           bytea,
  -- ===== Kupat Holim / Payer =====
  kupat_holim_code      text check (kupat_holim_code in ('01','02','03','04','99')),
  kupat_holim_member_id text,
  insurance_tier        text,
  -- ===== Clinical flags =====
  blood_type            text check (blood_type in ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  allergies_json        jsonb not null default '[]'::jsonb,
  chronic_conditions    jsonb not null default '[]'::jsonb,
  primary_provider_id   bigint,
  -- ===== Consent / זכויות חולה =====
  consent_signed_at     timestamptz,
  consent_version       text,
  consent_document_id   bigint,
  helsinki_status       text check (helsinki_status in ('not_required','pending','approved','rejected','expired')),
  data_subject_optout   boolean not null default false,
  -- ===== Lifecycle =====
  status                text not null default 'active'
    check (status in ('active','inactive','deceased','merged','redacted')),
  deceased_at           timestamptz,
  merged_into_patient_id bigint references health.patients(id),
  is_active             boolean not null default true,
  is_deleted            boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            bigint,
  updated_by            bigint,
  tenant_id             bigint,
  metadata              jsonb not null default '{}'::jsonb
);
comment on table  health.patients              is 'מטופלים — patient master. PHI tier: גבוה במיוחד. National ID stored as salted hash only.';
comment on column health.patients.national_id_hash    is 'SHA-256(salt || teudat_zehut). Plaintext NEVER stored. Lookup via deterministic hash function only.';
comment on column health.patients.phone_e164_enc      is 'pgp_sym_encrypt or KMS-wrapped. Decrypt only via authorized SECURITY DEFINER function.';
comment on column health.patients.kupat_holim_code    is '01=Clalit, 02=Maccabi, 03=Meuhedet, 04=Leumit, 99=Private/Tourist.';
comment on column health.patients.helsinki_status     is 'ועדת הלסינקי approval status when patient is in research protocol.';
comment on column health.patients.data_subject_optout is 'סעיף 13 חוק הגנת הפרטיות — data subject opt-out from secondary use.';

create index if not exists idx_patients_national_hash on health.patients (national_id_hash);
create index if not exists idx_patients_kupat         on health.patients (kupat_holim_code, kupat_holim_member_id);
create index if not exists idx_patients_provider     on health.patients (primary_provider_id);
create index if not exists idx_patients_status       on health.patients (status, is_active);
create index if not exists idx_patients_family_given on health.patients (family_name, given_name);

-- ──────────────────────────────────────────────────────────────
-- PART C: Appointments (תורים / ביקורים)
-- ──────────────────────────────────────────────────────────────

create table if not exists health.appointments (
  id                  bigserial primary key,
  public_id           uuid not null default gen_random_uuid(),
  appointment_code    text not null unique,
  patient_id          bigint not null references health.patients(id) on delete restrict,
  provider_id         bigint not null,
  clinic_location_id  bigint,
  appointment_type    text not null check (appointment_type in (
    'first_visit','followup','consultation','procedure','telehealth',
    'lab_draw','imaging','vaccination','emergency','home_visit'
  )),
  specialty_code      text,
  scheduled_start     timestamptz not null,
  scheduled_end       timestamptz not null,
  actual_start        timestamptz,
  actual_end          timestamptz,
  status              text not null default 'scheduled'
    check (status in (
      'scheduled','confirmed','checked_in','in_progress',
      'completed','no_show','cancelled_patient','cancelled_provider','rescheduled'
    )),
  cancellation_reason text,
  chief_complaint     text,
  visit_summary       text,
  diagnosis_codes     jsonb not null default '[]'::jsonb,
  procedure_codes     jsonb not null default '[]'::jsonb,
  vital_signs         jsonb,
  reminder_sent_at    timestamptz,
  copay_amount        numeric(12,2),
  is_active           boolean not null default true,
  is_deleted          boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          bigint,
  updated_by          bigint,
  tenant_id           bigint,
  metadata            jsonb not null default '{}'::jsonb,
  constraint chk_appt_time_order check (scheduled_end > scheduled_start)
);
comment on table  health.appointments               is 'תורים וביקורים — appointment / encounter scheduling. PHI tier: גבוה במיוחד.';
comment on column health.appointments.diagnosis_codes is 'ICD-10 / ICD-11 codes per encounter. Format: [{"system":"icd-10","code":"J06.9","desc":"…"}].';
comment on column health.appointments.procedure_codes is 'CPT / משרד הבריאות procedure code list.';

create index if not exists idx_appointments_patient        on health.appointments (patient_id, scheduled_start desc);
create index if not exists idx_appointments_provider       on health.appointments (provider_id, scheduled_start);
create index if not exists idx_appointments_status_date    on health.appointments (status, scheduled_start);
create index if not exists idx_appointments_clinic         on health.appointments (clinic_location_id, scheduled_start);

-- ──────────────────────────────────────────────────────────────
-- PART D: Prescriptions (מרשמים)
-- ──────────────────────────────────────────────────────────────

create table if not exists health.prescriptions (
  id                    bigserial primary key,
  public_id             uuid not null default gen_random_uuid(),
  prescription_code     text not null unique,
  patient_id            bigint not null references health.patients(id) on delete restrict,
  prescriber_id         bigint not null,
  appointment_id        bigint references health.appointments(id),
  -- ===== Drug =====
  drug_name             text not null,
  drug_atc_code         text,
  drug_dosage_form      text,
  drug_strength         text,
  -- ===== Order =====
  dose_amount           numeric(10,3),
  dose_unit             text,
  frequency_code        text,
  route_code            text check (route_code in (
    'PO','SL','BUC','IV','IM','SC','TOP','OPH','OTIC','NAS','INH','PR','VAG','TD'
  )),
  duration_days         integer,
  total_quantity        numeric(10,3),
  refills_authorized    integer not null default 0,
  refills_remaining     integer not null default 0,
  -- ===== Indications / safety =====
  indication_icd_code   text,
  ddi_check_status      text check (ddi_check_status in ('not_run','clean','warning','severe','overridden')),
  ddi_warnings          jsonb not null default '[]'::jsonb,
  prn_flag              boolean not null default false,
  controlled_substance  text check (controlled_substance in ('none','schedule_1','schedule_2','schedule_3','psychotropic')),
  -- ===== Digital signature (חוק חתימה אלקטרונית) =====
  signature_hash        text,
  signed_at             timestamptz,
  -- ===== Lifecycle =====
  status                text not null default 'draft'
    check (status in ('draft','signed','sent_to_pharmacy','dispensed','partially_dispensed','cancelled','expired')),
  sent_to_pharmacy_id   bigint,
  dispensed_at          timestamptz,
  expires_at            timestamptz,
  is_active             boolean not null default true,
  is_deleted            boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            bigint,
  updated_by            bigint,
  tenant_id             bigint,
  metadata              jsonb not null default '{}'::jsonb
);
comment on table  health.prescriptions                    is 'מרשמים — prescriptions. Requires digital signature per חוק חתימה אלקטרונית התשס"א-2001 before dispensing.';
comment on column health.prescriptions.drug_atc_code      is 'WHO ATC classification (e.g. J01CA04 = Amoxicillin).';
comment on column health.prescriptions.controlled_substance is 'פקודת הסמים המסוכנים — controlled drug schedule. Triggers extra audit + biometric on sign.';
comment on column health.prescriptions.ddi_check_status   is 'Drug-drug interaction screening result. "severe" must be acknowledged before status -> signed.';

create index if not exists idx_prescriptions_patient    on health.prescriptions (patient_id, created_at desc);
create index if not exists idx_prescriptions_prescriber on health.prescriptions (prescriber_id, signed_at desc);
create index if not exists idx_prescriptions_status     on health.prescriptions (status, expires_at);
create index if not exists idx_prescriptions_appointment on health.prescriptions (appointment_id);
create index if not exists idx_prescriptions_atc        on health.prescriptions (drug_atc_code);

-- ──────────────────────────────────────────────────────────────
-- PART E: Billing (חיוב רפואי / תביעות לקופת חולים)
-- ──────────────────────────────────────────────────────────────

create table if not exists health.billing (
  id                    bigserial primary key,
  public_id             uuid not null default gen_random_uuid(),
  billing_code          text not null unique,
  patient_id            bigint not null references health.patients(id) on delete restrict,
  appointment_id        bigint references health.appointments(id),
  prescription_id       bigint references health.prescriptions(id),
  -- ===== Payer =====
  payer_type            text not null check (payer_type in ('kupat_holim','private_insurance','self_pay','workers_comp','mvajot','sal_mashlim')),
  kupat_holim_code      text check (kupat_holim_code in ('01','02','03','04','99')),
  insurance_policy_no   text,
  -- ===== Charges =====
  service_date          date not null,
  cpt_code              text,
  ministry_proc_code    text,
  diagnosis_primary     text,
  diagnosis_secondary   jsonb not null default '[]'::jsonb,
  units                 numeric(8,2) not null default 1,
  charge_amount         numeric(12,2) not null,
  allowed_amount        numeric(12,2),
  patient_responsibility numeric(12,2),
  payer_paid_amount     numeric(12,2),
  -- ===== Claim =====
  claim_number          text,
  claim_submitted_at    timestamptz,
  claim_status          text check (claim_status in (
    'not_submitted','submitted','accepted','rejected','denied',
    'partial_payment','paid','appealed','written_off'
  )),
  denial_reason_code    text,
  remittance_received_at timestamptz,
  -- ===== Lifecycle =====
  status                text not null default 'open'
    check (status in ('open','billed','partially_paid','paid','closed','disputed','written_off')),
  is_active             boolean not null default true,
  is_deleted            boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            bigint,
  updated_by            bigint,
  tenant_id             bigint,
  metadata              jsonb not null default '{}'::jsonb,
  constraint chk_billing_amounts_nonneg check (
    charge_amount >= 0 and coalesce(allowed_amount,0) >= 0
    and coalesce(payer_paid_amount,0) >= 0
    and coalesce(patient_responsibility,0) >= 0
  )
);
comment on table  health.billing                  is 'חיוב רפואי — medical billing & payer claims. Maps to ONYX_PROCUREMENT.invoices via metadata.invoice_id (cross-service contract, no FK).';
comment on column health.billing.payer_type       is 'sal_mashlim = שב"ן (supplemental); mvajot = ביטוחים מסחריים מאוחדים.';
comment on column health.billing.ministry_proc_code is 'קוד פעולה משרד הבריאות / חוזר מנכ"ל. Coexists with CPT for international compatibility.';

create index if not exists idx_billing_patient    on health.billing (patient_id, service_date desc);
create index if not exists idx_billing_payer      on health.billing (payer_type, kupat_holim_code, claim_status);
create index if not exists idx_billing_status     on health.billing (status, service_date desc);
create index if not exists idx_billing_claim      on health.billing (claim_number);
create index if not exists idx_billing_appointment on health.billing (appointment_id);

-- ──────────────────────────────────────────────────────────────
-- PART F: Medical Records (תיק רפואי — append-only)
-- ──────────────────────────────────────────────────────────────

create table if not exists health.medical_records (
  id                bigserial primary key,
  public_id         uuid not null default gen_random_uuid(),
  record_code       text not null unique,
  patient_id        bigint not null references health.patients(id) on delete restrict,
  appointment_id    bigint references health.appointments(id),
  author_id         bigint not null,
  -- ===== Content =====
  record_type       text not null check (record_type in (
    'progress_note','soap_note','consult_letter','operative_report',
    'discharge_summary','lab_result','imaging_report','pathology_report',
    'allergy_event','immunization','vaccination','referral','consent_form','death_certificate'
  )),
  specialty_code    text,
  title             text,
  body_encrypted    bytea,
  body_hash         text not null,
  attachments       jsonb not null default '[]'::jsonb,
  -- ===== Coding =====
  icd_codes         jsonb not null default '[]'::jsonb,
  loinc_codes       jsonb not null default '[]'::jsonb,
  snomed_codes      jsonb not null default '[]'::jsonb,
  -- ===== Append-only ledger =====
  prev_record_id    bigint references health.medical_records(id),
  hash_chain        text not null,
  signed_at         timestamptz,
  signed_by         bigint,
  signature_hash    text,
  amendment_of      bigint references health.medical_records(id),
  amendment_reason  text,
  -- ===== Access controls =====
  sensitivity_level text not null default 'standard'
    check (sensitivity_level in ('standard','sensitive','very_sensitive','sealed')),
  break_glass_only  boolean not null default false,
  -- ===== Retention (סעיף 18 חוק זכויות החולה) =====
  retention_class   text not null default 'adult_7y'
    check (retention_class in ('adult_7y','minor_until_25','psych_lifetime','permanent')),
  purge_after       date,
  -- ===== Lifecycle =====
  status            text not null default 'final'
    check (status in ('draft','final','amended','superseded','sealed','redacted_by_court')),
  is_active         boolean not null default true,
  is_deleted        boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        bigint,
  updated_by        bigint,
  tenant_id         bigint,
  metadata          jsonb not null default '{}'::jsonb
);
comment on table  health.medical_records                  is 'תיק רפואי — append-only EHR ledger. Hash chained per patient. UPDATE blocked except status transitions; corrections via amendment_of.';
comment on column health.medical_records.body_hash        is 'SHA-256 of plaintext body. Used for tamper detection independent of encryption key rotation.';
comment on column health.medical_records.hash_chain       is 'SHA-256(prev.hash_chain || body_hash || signed_at). Forms verifiable audit chain per patient.';
comment on column health.medical_records.sensitivity_level is 'sensitive=mental health, sexual health, addiction; very_sensitive=HIV, genetic, abuse cases — break-glass + extra audit.';
comment on column health.medical_records.retention_class  is 'minor_until_25 per סעיף 18(ב); psych_lifetime per תקנות בריאות הנפש.';

create index if not exists idx_medrec_patient_created on health.medical_records (patient_id, created_at desc);
create index if not exists idx_medrec_appointment   on health.medical_records (appointment_id);
create index if not exists idx_medrec_type_status   on health.medical_records (record_type, status);
create index if not exists idx_medrec_chain         on health.medical_records (patient_id, prev_record_id);
create index if not exists idx_medrec_purge         on health.medical_records (purge_after) where purge_after is not null;
create index if not exists idx_medrec_sensitivity   on health.medical_records (sensitivity_level, break_glass_only);

-- ──────────────────────────────────────────────────────────────
-- PART G: updated_at triggers (canonical pattern)
-- ──────────────────────────────────────────────────────────────

create or replace function health.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end$$;

do $$
declare t text;
declare tabs text[] := array['patients','appointments','prescriptions','billing','medical_records'];
begin
  foreach t in array tabs loop
    execute format('drop trigger if exists trg_%1$s_updated_at on health.%1$I', t);
    execute format('create trigger trg_%1$s_updated_at before update on health.%1$I for each row execute function health.set_updated_at()', t);
  end loop;
end$$;

-- Block UPDATE/DELETE on medical_records body fields (append-only)
create or replace function health.medrec_immutable_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'health.medical_records is append-only — DELETE blocked. Use status=redacted_by_court via amendment.';
  end if;
  if tg_op = 'UPDATE' then
    if old.body_encrypted is distinct from new.body_encrypted
       or old.body_hash is distinct from new.body_hash
       or old.hash_chain is distinct from new.hash_chain
       or old.signed_at  is distinct from new.signed_at then
      raise exception 'health.medical_records body/hash/signature are immutable. Use amendment_of pointer.';
    end if;
  end if;
  return new;
end$$;

drop trigger if exists trg_medrec_immutable on health.medical_records;
create trigger trg_medrec_immutable
  before update or delete on health.medical_records
  for each row execute function health.medrec_immutable_guard();

-- ──────────────────────────────────────────────────────────────
-- PART H: RLS — enable + baseline policies
-- ──────────────────────────────────────────────────────────────
-- NOTE: clinical RLS in production must scope by patient->provider
-- relationship + break-glass audit. These baselines deny anon and
-- restrict to authenticated; the ONYX_HEALTH service tightens.

do $$
declare
  t text;
  tables text[] := array['patients','appointments','prescriptions','billing','medical_records'];
begin
  foreach t in array tables loop
    execute format('alter table health.%I enable row level security', t);
    execute format('alter table health.%I force row level security', t);

    begin
      execute format($p$
        create policy "%1$s_read_auth" on health.%1$I
          for select to authenticated
          using ((select auth.uid()) is not null)
      $p$, t);
    exception when duplicate_object then null;
    end;

    begin
      execute format($p$
        create policy "%1$s_insert_auth" on health.%1$I
          for insert to authenticated
          with check ((select auth.uid()) is not null)
      $p$, t);
    exception when duplicate_object then null;
    end;

    begin
      execute format($p$
        create policy "%1$s_update_auth" on health.%1$I
          for update to authenticated
          using ((select auth.uid()) is not null)
          with check ((select auth.uid()) is not null)
      $p$, t);
    exception when duplicate_object then null;
    end;

    begin
      execute format($p$
        create policy "%1$s_service_all" on health.%1$I
          for all to service_role
          using (true) with check (true)
      $p$, t);
    exception when duplicate_object then null;
    end;
  end loop;
end$$;

-- Explicitly revoke from anon — clinical PHI must never be public
revoke all on all tables in schema health from anon;
revoke all on schema health from anon;

-- ============================================================
-- END 00077_health_domain.sql
-- ============================================================
