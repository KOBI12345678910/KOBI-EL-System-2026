# QA-AGENT-144 — Real Estate Property Tracking (Cross-Project, Static, Hebrew)

**Status:** Forward-looking / design-only. **No real estate module currently exists** in the `onyx-procurement` codebase or in any sibling project (AI-Task-Manager, GPS-Connect). This document is a blueprint for a future `modules/real-estate/` module to be added to the Techno-Kol OPS / PARADIGM platform.

**Context:** Kobi operates a real estate business alongside his primary operation. The platform must support property portfolio tracking, tenant management, lease lifecycle, rent collection, and Israeli regulatory compliance (חוק שכירות הוגנת, ארנונה, ועד בית).

**Date:** 2026-04-11
**Cross-project dimension:** Real Estate / נדל"ן
**Scope:** Design review of tables, flows, and Israeli legal compliance hooks.

---

## 1. Does any real estate module exist today? (קיימות נוכחית)

**Finding: NO.**

Searched paths:
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\` — no files matching `real-estate|property|tenant|lease|rent|נדל|שכיר|ארנונה|ועד בית` in source folders (all matches are inside `QA-AGENT-*.md` QA docs where "property" refers to JS object properties, not real estate).
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\AI-Task-Manager\` — only false positives (`node_modules` unicode packages, React property names, `realpath`, `realtime`).
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\GPS-Connect\` — none.

Conclusion: a dedicated real-estate module must be built from scratch. Recommended home: `onyx-procurement/src/modules/real-estate/` with its own Ontology entity family parallel to the existing Procurement / HR / Finance families introduced in Parts 3-11.

**Naming convention** (align with existing PARADIGM Ontology Engine — Part 11):
- Entities: `RealEstateProperty`, `Tenant`, `Lease`, `RentInvoice`, `RentPayment`, `MaintenanceTicket`, `MunicipalTax`, `BuildingCommittee`.
- Namespace: `re.` (e.g., `re.property`, `re.lease`, `re.payment`).
- Event bus topics: `re.property.*`, `re.lease.*`, `re.payment.*`.

---

## 2. Property Table Design — `re_property` (טבלת נכסים)

Forward-looking schema. PostgreSQL. Hebrew-first, RTL-ready.

```sql
CREATE TABLE re_property (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id            UUID NOT NULL REFERENCES users(id),           -- Kobi or legal entity
  legal_owner_entity  TEXT,                                         -- חברה בע"מ / יחיד / שותפות
  property_code       TEXT UNIQUE NOT NULL,                         -- קוד פנימי, e.g., "KBE-TLV-001"

  -- Classification
  property_type       TEXT NOT NULL CHECK (property_type IN
    ('apartment','house','commercial','office','storage','parking','land','mixed')),
  -- דירה / בית פרטי / מסחרי / משרד / מחסן / חניה / קרקע / מעורב

  -- Address (Hebrew)
  address_street      TEXT NOT NULL,                                -- רחוב
  address_number      TEXT NOT NULL,                                -- מספר
  address_apt         TEXT,                                         -- מספר דירה
  address_floor       SMALLINT,                                     -- קומה
  address_city        TEXT NOT NULL,                                -- עיר
  address_zip         TEXT,                                         -- מיקוד
  address_country     TEXT NOT NULL DEFAULT 'IL',

  -- Official identifiers (Israeli)
  gush                TEXT,                                         -- גוש
  chelka              TEXT,                                         -- חלקה
  tat_chelka          TEXT,                                         -- תת-חלקה
  tabu_id             TEXT,                                         -- מספר נכס בטאבו

  -- Physical specs
  size_sqm            NUMERIC(8,2),                                 -- שטח במ"ר
  rooms               NUMERIC(3,1),                                 -- מספר חדרים (3.5 וכו')
  year_built          SMALLINT,                                     -- שנת בנייה
  has_parking         BOOLEAN DEFAULT FALSE,
  has_storage         BOOLEAN DEFAULT FALSE,
  has_elevator        BOOLEAN DEFAULT FALSE,
  has_shelter         BOOLEAN DEFAULT FALSE,                        -- ממ"ד / מקלט
  has_balcony         BOOLEAN DEFAULT FALSE,
  furnished           BOOLEAN DEFAULT FALSE,                        -- מרוהט

  -- Financial
  purchase_price_ils  NUMERIC(14,2),                                -- מחיר רכישה
  purchase_date       DATE,
  current_valuation_ils NUMERIC(14,2),                              -- הערכת שווי נוכחית
  valuation_date      DATE,
  mortgage_id         UUID,                                         -- FK → re_mortgage (future)

  -- Status
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN
    ('active','vacant','rented','renovation','sold','listed')),
  -- פעיל / פנוי / מושכר / בשיפוץ / נמכר / להשכרה

  -- Metadata
  tags                TEXT[],                                       -- תגים חופשיים
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ                                   -- soft delete
);

CREATE INDEX idx_re_property_owner      ON re_property(owner_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_re_property_status     ON re_property(status);
CREATE INDEX idx_re_property_city       ON re_property(address_city);
CREATE INDEX idx_re_property_type       ON re_property(property_type);
CREATE UNIQUE INDEX idx_re_property_gush_chelka
  ON re_property(gush, chelka, tat_chelka) WHERE gush IS NOT NULL;
```

**Design notes:**
- `gush`/`chelka`/`tat_chelka` are the Israeli cadastral identifiers — keep them as TEXT (leading zeros matter).
- `property_code` is human-facing; enforce `^[A-Z]{3}-[A-Z]{3}-\d{3,}$` in app layer.
- Soft-delete via `deleted_at` (PARADIGM convention, matches existing audit trail).
- Emit `re.property.created` / `re.property.updated` / `re.property.sold` to the EventBus (Part 11).

---

## 3. Tenants Table — `re_tenant` (טבלת דיירים)

```sql
CREATE TABLE re_tenant (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_type         TEXT NOT NULL CHECK (tenant_type IN ('individual','company')),
  -- יחיד / חברה

  -- Individual (יחיד)
  first_name          TEXT,                                         -- שם פרטי
  last_name           TEXT,                                         -- שם משפחה
  id_number           TEXT,                                         -- ת.ז. (9 digits, validate check digit)
  id_type             TEXT DEFAULT 'teudat_zehut' CHECK (id_type IN
    ('teudat_zehut','passport','foreign_id')),
  date_of_birth       DATE,

  -- Company (חברה)
  company_name        TEXT,                                         -- שם החברה
  company_registration TEXT,                                        -- ח.פ. / עוסק מורשה
  company_type        TEXT,                                         -- בע"מ / עוסק מורשה / עוסק פטור

  -- Contact (always required)
  phone_primary       TEXT NOT NULL,
  phone_secondary     TEXT,
  email               TEXT,
  preferred_language  TEXT DEFAULT 'he' CHECK (preferred_language IN ('he','en','ar','ru')),

  -- KYC / Due diligence
  credit_score        SMALLINT,                                     -- דירוג BDI / Dun
  credit_check_date   DATE,
  employment_status   TEXT,                                         -- שכיר / עצמאי / פנסיונר / סטודנט
  employer_name       TEXT,
  monthly_income_ils  NUMERIC(12,2),
  guarantor_id        UUID REFERENCES re_tenant(id),                -- ערב
  guarantor_count     SMALLINT DEFAULT 0,                           -- מספר ערבים נדרש

  -- Status
  status              TEXT NOT NULL DEFAULT 'prospect' CHECK (status IN
    ('prospect','active','former','blacklisted','legal_action')),
  -- מועמד / פעיל / לשעבר / ברשימה שחורה / בהליך משפטי
  blacklist_reason    TEXT,

  -- Compliance (PII)
  pii_consent         BOOLEAN NOT NULL DEFAULT FALSE,               -- הסכמת פרטיות
  pii_consent_date    TIMESTAMPTZ,
  id_document_path    TEXT,                                         -- S3 key, encrypted

  -- Audit
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ,

  CHECK (
    (tenant_type = 'individual' AND first_name IS NOT NULL AND id_number IS NOT NULL) OR
    (tenant_type = 'company' AND company_name IS NOT NULL AND company_registration IS NOT NULL)
  )
);

CREATE UNIQUE INDEX idx_re_tenant_id_number
  ON re_tenant(id_number) WHERE id_number IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX idx_re_tenant_company_reg
  ON re_tenant(company_registration) WHERE company_registration IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_re_tenant_status ON re_tenant(status);
CREATE INDEX idx_re_tenant_phone  ON re_tenant(phone_primary);
```

**Design notes:**
- `id_number` must pass Israeli teudat-zehut Luhn check in app layer (see `QA-AGENT-27-ISRAELI-PRIVACY.md` pattern).
- `pii_consent` mandatory before storing — aligns with חוק הגנת הפרטיות (see existing QA-AGENT-27).
- Guarantor self-reference handles ערב מצב בו הערב עצמו הוא שוכר אחר.
- Encrypt `id_document_path` objects at rest via the pattern in `QA-AGENT-29-ENCRYPTION.md`.

---

## 4. Lease Tracking — `re_lease` (חוזי שכירות)

```sql
CREATE TABLE re_lease (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_number        TEXT UNIQUE NOT NULL,                         -- מספר חוזה (e.g., "L-2026-001")
  property_id         UUID NOT NULL REFERENCES re_property(id),
  primary_tenant_id   UUID NOT NULL REFERENCES re_tenant(id),

  -- Term (תקופה)
  start_date          DATE NOT NULL,                                -- תאריך התחלה
  end_date            DATE NOT NULL,                                -- תאריך סיום
  original_end_date   DATE NOT NULL,                                -- תאריך סיום מקורי (לפני הארכות)
  term_months         SMALLINT GENERATED ALWAYS AS
    (EXTRACT(MONTH FROM AGE(end_date, start_date)) +
     EXTRACT(YEAR FROM AGE(end_date, start_date)) * 12) STORED,

  -- Renewal option (אופציה להארכה)
  has_renewal_option  BOOLEAN DEFAULT FALSE,
  renewal_months      SMALLINT,
  renewal_notice_days SMALLINT DEFAULT 60,                          -- ימי הודעה מראש
  renewal_exercised   BOOLEAN DEFAULT FALSE,

  -- Financial
  monthly_rent_ils    NUMERIC(10,2) NOT NULL,                       -- דמי שכירות חודשיים
  rent_currency       TEXT NOT NULL DEFAULT 'ILS' CHECK (rent_currency IN ('ILS','USD','EUR')),
  rent_index_linked   BOOLEAN DEFAULT FALSE,                        -- צמוד מדד
  rent_index_type     TEXT CHECK (rent_index_type IN
    ('cpi','dollar','euro','construction')),
  -- מדד מחירים לצרכן / דולר / יורו / מדד תשומות הבנייה
  rent_index_base     NUMERIC(8,3),                                 -- מדד בסיס
  rent_index_base_date DATE,
  next_indexation_date DATE,

  -- Deposit & guarantees (פיקדונות וערבויות)
  security_deposit_ils NUMERIC(10,2),                               -- פיקדון ביטחון
  bank_guarantee_ils  NUMERIC(10,2),                                -- ערבות בנקאית
  bank_guarantee_expiry DATE,
  promissory_note_ils NUMERIC(10,2),                                -- שטר חוב
  guarantor_ids       UUID[] DEFAULT '{}',                          -- ערבים (array of tenant ids)

  -- Payment schedule
  payment_day         SMALLINT NOT NULL DEFAULT 1 CHECK (payment_day BETWEEN 1 AND 31),
  payment_method      TEXT NOT NULL CHECK (payment_method IN
    ('bank_transfer','standing_order','check','cash','credit_card','crypto')),
  -- העברה בנקאית / הוראת קבע / צ'קים / מזומן / כרטיס אשראי / קריפטו
  checks_deposited    SMALLINT DEFAULT 0,                           -- צ'קים שהופקדו מראש

  -- Cost allocation (הפרדת תשלומים — critical for חוק שכירות הוגנת)
  arnona_by           TEXT DEFAULT 'tenant' CHECK (arnona_by IN ('tenant','landlord')),
  vaad_bayit_by       TEXT DEFAULT 'tenant' CHECK (vaad_bayit_by IN ('tenant','landlord')),
  water_by            TEXT DEFAULT 'tenant' CHECK (water_by IN ('tenant','landlord')),
  electricity_by      TEXT DEFAULT 'tenant' CHECK (electricity_by IN ('tenant','landlord')),
  gas_by              TEXT DEFAULT 'tenant' CHECK (gas_by IN ('tenant','landlord')),
  internet_by         TEXT DEFAULT 'tenant' CHECK (internet_by IN ('tenant','landlord')),
  building_insurance_by TEXT DEFAULT 'landlord' CHECK (building_insurance_by IN ('tenant','landlord')),

  -- Legal (חוק שכירות הוגנת, 2017)
  fair_rental_law_compliant BOOLEAN NOT NULL DEFAULT TRUE,
  habitability_certified BOOLEAN NOT NULL DEFAULT FALSE,            -- תעודת ראויות למגורים
  signed_pdf_path     TEXT,                                         -- S3 key לחוזה חתום
  signed_date         DATE,
  broker_id           UUID,                                         -- מתווך
  broker_fee_ils      NUMERIC(10,2),

  -- Status
  status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN
    ('draft','signed','active','expired','terminated_early','in_dispute','archived')),
  -- טיוטה / חתום / פעיל / פג / הופסק מוקדם / במחלוקת / בארכיון

  termination_date    DATE,
  termination_reason  TEXT,

  -- Audit
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (end_date > start_date)
);

CREATE INDEX idx_re_lease_property  ON re_lease(property_id);
CREATE INDEX idx_re_lease_tenant    ON re_lease(primary_tenant_id);
CREATE INDEX idx_re_lease_status    ON re_lease(status);
CREATE INDEX idx_re_lease_active    ON re_lease(start_date, end_date)
  WHERE status IN ('active','signed');
CREATE INDEX idx_re_lease_next_idx  ON re_lease(next_indexation_date)
  WHERE rent_index_linked = TRUE;
```

**Additional table — `re_lease_co_tenant`** for multi-tenant leases (zug/shutafim):
```sql
CREATE TABLE re_lease_co_tenant (
  lease_id   UUID REFERENCES re_lease(id) ON DELETE CASCADE,
  tenant_id  UUID REFERENCES re_tenant(id),
  share_pct  NUMERIC(5,2) DEFAULT 100.00,                           -- חלקו באחוזים
  role       TEXT NOT NULL DEFAULT 'co_tenant' CHECK (role IN
    ('primary','co_tenant','guarantor')),
  PRIMARY KEY (lease_id, tenant_id)
);
```

**Design notes:**
- `term_months` generated column for fast "leases expiring in X months" queries (dashboard).
- `checks_deposited` supports the Israeli custom of collecting 12-24 post-dated checks upfront.
- `arnona_by`, `vaad_bayit_by` — explicit cost allocation is required by חוק שכירות הוגנת to avoid "hidden" costs passed to tenant.

---

## 5. Rent Collection — `re_rent_invoice` + `re_rent_payment` (גביית שכירות)

```sql
CREATE TABLE re_rent_invoice (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id            UUID NOT NULL REFERENCES re_lease(id),
  invoice_number      TEXT UNIQUE NOT NULL,                         -- מספר חשבונית

  -- Period
  period_year         SMALLINT NOT NULL,
  period_month        SMALLINT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  due_date            DATE NOT NULL,

  -- Amounts (breakdown for transparency — required by law)
  base_rent_ils       NUMERIC(10,2) NOT NULL,                       -- שכירות בסיס
  indexation_ils      NUMERIC(10,2) DEFAULT 0,                      -- הצמדה
  vaad_bayit_ils      NUMERIC(10,2) DEFAULT 0,                      -- ועד בית (אם על השוכר)
  arnona_ils          NUMERIC(10,2) DEFAULT 0,                      -- ארנונה (אם על השוכר)
  other_charges_ils   NUMERIC(10,2) DEFAULT 0,                      -- חיובים נוספים
  late_fee_ils        NUMERIC(10,2) DEFAULT 0,                      -- ריבית פיגורים
  total_ils           NUMERIC(10,2) NOT NULL,

  -- VAT (מע"מ) — only for commercial/business leases
  vat_applicable      BOOLEAN DEFAULT FALSE,
  vat_rate_pct        NUMERIC(5,2) DEFAULT 18.00,                   -- 18% from 2025
  vat_amount_ils      NUMERIC(10,2) DEFAULT 0,

  -- Status
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN
    ('open','partial','paid','overdue','written_off','disputed')),
  -- פתוחה / תשלום חלקי / שולמה / בפיגור / נמחקה / במחלוקת

  sent_at             TIMESTAMPTZ,
  reminder_count      SMALLINT DEFAULT 0,
  last_reminder_at    TIMESTAMPTZ,

  -- Audit
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (lease_id, period_year, period_month)
);

CREATE INDEX idx_re_invoice_lease     ON re_rent_invoice(lease_id);
CREATE INDEX idx_re_invoice_status    ON re_rent_invoice(status);
CREATE INDEX idx_re_invoice_due       ON re_rent_invoice(due_date)
  WHERE status IN ('open','partial','overdue');

CREATE TABLE re_rent_payment (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id          UUID NOT NULL REFERENCES re_rent_invoice(id),
  lease_id            UUID NOT NULL REFERENCES re_lease(id),
  tenant_id           UUID NOT NULL REFERENCES re_tenant(id),

  paid_at             TIMESTAMPTZ NOT NULL,
  value_date           DATE NOT NULL,                               -- תאריך ערך
  amount_ils          NUMERIC(10,2) NOT NULL CHECK (amount_ils > 0),
  payment_method      TEXT NOT NULL,

  -- Method-specific
  check_number        TEXT,                                         -- מס' צ'ק
  check_date          DATE,
  check_bank          TEXT,
  bank_reference      TEXT,                                         -- אסמכתא בנקאית
  transaction_id      TEXT,                                         -- ID של סולק אשראי

  -- Reconciliation
  bank_matched        BOOLEAN DEFAULT FALSE,                        -- הותאם לדף בנק
  bank_statement_id   UUID,

  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_re_payment_invoice ON re_rent_payment(invoice_id);
CREATE INDEX idx_re_payment_tenant  ON re_rent_payment(tenant_id);
CREATE INDEX idx_re_payment_date    ON re_rent_payment(paid_at);
```

**Flow:**
1. **Cron job** (suggested: monthly, 25th of previous month) generates `re_rent_invoice` rows for all `active` leases.
2. **Indexation engine** recalculates `indexation_ils` based on `rent_index_type` and latest CPI (לשכה מרכזית לסטטיסטיקה API).
3. **Reminder bot** (EventBus `re.invoice.overdue`) sends WhatsApp/SMS reminders at T+3, T+7, T+14 days (configurable).
4. **Bank reconciliation** — import bank statement daily, auto-match by `bank_reference` or amount+date window.
5. **Late fees** — accrue per lease `late_fee_pct` but capped at legal maximum (ריבית פיגורים).

---

## 6. Israeli Rental Law Compliance — חוק השכירות והשאילה ותיקון "שכירות הוגנת" (2017)

**Reference law:** חוק השכירות והשאילה, התשל"א-1971, as amended by חוק שכירות הוגנת (תיקון מס' 2), 2017, סעיפים 25א-25יז.

### Mandatory fields / rules the module MUST enforce:

| # | Requirement (Hebrew) | Module implementation |
|---|----------------------|-----------------------|
| 1 | דרישת ראויות למגורים (סעיף 25ב) — הנכס חייב להיות ראוי למגורים | `re_lease.habitability_certified` — block `status='active'` unless TRUE. Requires: חשמל תקין, מים, ניקוז, אוורור, תאורה טבעית, מנעול לדלת הכניסה, חלונות. |
| 2 | רשימת ליקויים מראש (סעיף 25ג) | Separate table `re_lease_defects_checklist` — must be attached before signature. |
| 3 | חוזה בכתב חובה מעל 10 חודשים (סעיף 25ד) | Validation: if `term_months > 10` then `signed_pdf_path IS NOT NULL`. |
| 4 | הגבלת פיקדון (סעיף 25ז) — פיקדון בטחון לא יעלה על 3 חודשי שכירות או 1/3 תקופת השכירות, לפי הנמוך | CHECK constraint: `security_deposit_ils <= LEAST(monthly_rent_ils * 3, monthly_rent_ils * term_months / 3)`. |
| 5 | הודעה מוקדמת לפינוי (סעיף 25יא) — 90 ימים לפני תום החוזה אם אין הארכה | Cron: T-90 days → create task for landlord; T-60 → reminder; T-30 → escalation. |
| 6 | זכות השוכר לתקן ליקויים על חשבון המשכיר (סעיף 25ט) | Table `re_maintenance_ticket` with `reported_by='tenant'`, SLA per defect severity, auto-escalation. |
| 7 | איסור על חיובים נסתרים | Cost allocation columns in `re_lease` (arnona_by, vaad_bayit_by, etc.) are explicit and immutable after signing — require a lease amendment (`re_lease_amendment` table) for changes. |
| 8 | איסור הפליה (סעיף 25טז) | Log all tenant rejection decisions in `re_tenant_rejection_log` with reason codes; block forbidden reasons (מוצא, דת, לאום, מצב משפחתי, נטייה מינית). |
| 9 | שקיפות בעדכון שכירות צמודה | On indexation recalculation, send advance notice to tenant (email+WhatsApp) 30 days before applying. |
| 10 | זכות שוכר לקבל אישורים על תשלומים | `re_rent_payment` → auto-generate קבלה PDF per payment. |

### Events to emit (EventBus integration — Part 11):
- `re.lease.signed` — triggers `habitability_certified` check
- `re.lease.expiring_soon` — emitted at T-90, T-60, T-30
- `re.invoice.overdue` — T+3, T+7, T+14 post due_date
- `re.lease.deposit_violation` — if amendment attempts illegal deposit
- `re.tenant.rejection_logged` — compliance audit trail

---

## 7. Taxes — ועד בית & ארנונה

### 7a. Arnona (ארנונה — municipal tax)

```sql
CREATE TABLE re_arnona (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id         UUID NOT NULL REFERENCES re_property(id),
  municipality        TEXT NOT NULL,                                -- שם הרשות המקומית
  arnona_account_no   TEXT NOT NULL,                                -- מספר חשבון ברשות
  classification_code TEXT,                                         -- סיווג נכס (מגורים/מסחר/משרד)
  classification_desc TEXT,                                         -- תיאור הסיווג

  -- Rates (annual)
  year                SMALLINT NOT NULL,
  rate_per_sqm_ils    NUMERIC(10,4) NOT NULL,                       -- תעריף למ"ר לשנה
  billable_sqm        NUMERIC(8,2) NOT NULL,                        -- שטח לחיוב
  annual_amount_ils   NUMERIC(10,2) NOT NULL,                       -- סכום שנתי

  -- Discounts (הנחות)
  discount_pct        NUMERIC(5,2) DEFAULT 0,
  discount_reason     TEXT,                                         -- נכה, אזרח ותיק, חד-הורית וכו'
  discount_eligibility_start DATE,
  discount_eligibility_end   DATE,

  -- Payment schedule
  payment_frequency   TEXT DEFAULT 'bimonthly' CHECK (payment_frequency IN
    ('monthly','bimonthly','quarterly','biannual','annual')),
  -- חודשי / דו-חודשי (ברירת מחדל בישראל) / רבעוני / חצי-שנתי / שנתי

  -- Who pays (per lease)
  paid_by             TEXT NOT NULL CHECK (paid_by IN ('tenant','landlord')),
  -- מוזן מ-re_lease.arnona_by של החוזה הפעיל

  -- Exemption (פטור)
  exempt_vacant       BOOLEAN DEFAULT FALSE,                        -- פטור נכס ריק (עד 6 חודשים)
  exempt_reason       TEXT,
  exempt_until        DATE,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (property_id, year)
);

CREATE INDEX idx_re_arnona_property ON re_arnona(property_id);
CREATE INDEX idx_re_arnona_year     ON re_arnona(year);
```

**Key rules:**
- **Vacant property exemption** (פטור נכס ריק): up to 6 months per 3 years. Track in `exempt_vacant` + `exempt_until`.
- **Tenant responsibility**: when `paid_by='tenant'`, landlord must notify municipality of tenant identity within 30 days (auto-generate notification via `re.arnona.tenant_change` event).
- **Discount eligibility**: נכה (disability), אזרח ותיק (senior), חד-הורית (single parent) — track expiration because discounts renew annually.
- **Escrow option**: add `re_arnona_payment` table mirroring `re_rent_payment` for tracking who paid what and when.

### 7b. Vaad Bayit (ועד בית — building committee dues)

```sql
CREATE TABLE re_vaad_bayit (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id         UUID NOT NULL REFERENCES re_property(id),

  building_name       TEXT,                                         -- שם הבניין
  vaad_manager_name   TEXT,                                         -- ראש הוועד
  vaad_manager_phone  TEXT,
  management_company  TEXT,                                         -- חברת ניהול (אם יש)

  -- Dues
  monthly_dues_ils    NUMERIC(8,2) NOT NULL,                        -- דמי ועד בית חודשיים
  calculation_basis   TEXT CHECK (calculation_basis IN
    ('per_unit','per_sqm','per_rooms','percentage')),
  -- ליחידה / למ"ר / לחדר / לפי אחוז ברכוש המשותף
  pct_of_building     NUMERIC(6,4),                                 -- אחוז ברכוש המשותף (אם רלוונטי)

  -- Services included (שירותים כלולים)
  includes_cleaning   BOOLEAN DEFAULT FALSE,                        -- ניקיון
  includes_gardening  BOOLEAN DEFAULT FALSE,                        -- גינון
  includes_elevator   BOOLEAN DEFAULT FALSE,                        -- אחזקת מעלית
  includes_lobby      BOOLEAN DEFAULT FALSE,                        -- אחזקת לובי
  includes_security   BOOLEAN DEFAULT FALSE,                        -- שמירה
  includes_pool       BOOLEAN DEFAULT FALSE,                        -- בריכה
  includes_gym        BOOLEAN DEFAULT FALSE,                        -- חדר כושר

  -- Special assessments (שדרוגים / תיקונים מיוחדים)
  special_assessment_active BOOLEAN DEFAULT FALSE,
  special_assessment_desc   TEXT,                                   -- שיפוץ מעלית, חידוש גג וכו'
  special_assessment_total  NUMERIC(12,2),
  special_assessment_installments SMALLINT,
  special_assessment_end_date DATE,

  -- Who pays (per lease) — legal default: ongoing = tenant, special = landlord
  ongoing_paid_by     TEXT DEFAULT 'tenant' CHECK (ongoing_paid_by IN ('tenant','landlord')),
  special_paid_by     TEXT DEFAULT 'landlord' CHECK (special_paid_by IN ('tenant','landlord')),

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_re_vaad_property ON re_vaad_bayit(property_id);
```

**Key rules:**
- **Legal default split**: ongoing dues (ניקיון, חשמל לובי, אחזקת מעלית שוטפת) → tenant. Capital improvements (שיפוץ גג, החלפת מעלית) → landlord. Always. This cannot be overridden in favor of the tenant bearing the capital cost under חוק שכירות הוגנת.
- **Rollup to invoice**: when `re_lease.vaad_bayit_by='tenant'`, the monthly invoice generator pulls `monthly_dues_ils` into `re_rent_invoice.vaad_bayit_ils`.
- **Special assessments**: emit `re.vaad.special_assessment.created` → force landlord to explicitly decline passing cost to tenant (compliance gate).

---

## Module integration checklist (PARADIGM alignment)

| Item | Status | Notes |
|------|--------|-------|
| Ontology entity registration (Part 11) | TODO | Register `re.*` family in `src/ontology/registry/real-estate.ts`. |
| EventBus topics | TODO | `re.property.*`, `re.lease.*`, `re.payment.*`, `re.arnona.*`, `re.vaad.*`. |
| Foundry pipeline (Part 11) | TODO | Daily batch: calc overdue, indexation, expiring leases, reminder fan-out. |
| RLS (Row-Level Security) | TODO | Every `re_*` table: `USING (owner_id = auth.uid() OR auth.has_role('admin'))`. |
| Audit trail | TODO | Use existing `audit_log` from Part 3 — log all INSERT/UPDATE/DELETE on `re_lease`, `re_rent_payment`, `re_tenant` (PII). |
| i18n/RTL | TODO | Align with `QA-AGENT-35-I18N-RTL.md` — all labels Hebrew-first. |
| PII handling | TODO | Tenant ID docs encrypted — see `QA-AGENT-29-ENCRYPTION.md`. |
| Privacy law compliance | TODO | See `QA-AGENT-27-ISRAELI-PRIVACY.md` — pii_consent required before storage. |
| Backup/DR | TODO | Include `re_*` tables in existing backup policy (`QA-AGENT-18-BACKUP-RESTORE.md`). |
| Tests | TODO | Unit tests for teudat-zehut validator, CPI indexation math, deposit cap validator, habitability gate. |

## Risks & open questions

1. **Currency volatility** — USD-linked leases need daily FX rate import (שער יציג from בנק ישראל API). Not covered above; needs its own `re_fx_rate` table.
2. **Multi-owner properties** (שותפות) — current `owner_id` is single UUID. For partnerships, introduce `re_property_owner` junction table.
3. **Sub-letting** (שכירות משנה) — recursive `re_lease.parent_lease_id` to track primary→sub chains. Not in v1.
4. **TAMA 38 / urban renewal** — major lifecycle event affecting property valuation and tenant displacement rights. Needs dedicated flow in v2.
5. **Vacation rental / Airbnb** — different tax regime (חלק ל'). Needs separate module or extension.
6. **Integration with existing Procurement module** — repair/maintenance materials should flow through the procurement engine (unified vendor DB), not be re-implemented inside real estate.

## Verdict

Module design is **ready for implementation** as a new PARADIGM part (suggested: **Part 12 — Real Estate & Tenancy Lifecycle**). All seven tables above should be created in a single migration under `src/migrations/012_real_estate.sql`. Total estimated effort: 2-3 sprints for core CRUD + compliance gates + EventBus wiring, excluding UI and external integrations (bank, municipality, CPI).
