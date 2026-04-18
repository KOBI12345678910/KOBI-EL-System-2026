-- ═══════════════════════════════════════════════════════════════
-- ONYX PROCUREMENT — Migration 007
-- Payroll / Wage Slip Module (B-08) — Wave 1.5
-- ═══════════════════════════════════════════════════════════════
-- Complies with חוק הגנת השכר תיקון 24 (Wage Protection Law Amendment 24)
-- Every wage slip MUST contain:
--   1. Employer identity (name, company id)
--   2. Employee identity (name, ID, position)
--   3. Period covered
--   4. Hours worked (regular, overtime)
--   5. Gross pay with breakdown
--   6. All deductions (income tax, ביטוח לאומי, מס בריאות, pension, study fund)
--   7. Net pay
--   8. Vacation/sick balances
--   9. Employer contributions

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- employers — legal entity that employs (usually same as tax profile)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employers (
  id                    SERIAL PRIMARY KEY,
  legal_name            TEXT NOT NULL,
  trading_name          TEXT,
  company_id            TEXT NOT NULL,            -- ח.פ / ע.מ
  tax_file_number       TEXT NOT NULL,            -- תיק ניכויים
  vat_file_number       TEXT,
  bituach_leumi_number  TEXT,                     -- מספר מעסיק בביטוח לאומי
  address               TEXT,
  city                  TEXT,
  phone                 TEXT,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id)
);

-- ─────────────────────────────────────────────────────────────
-- employees — with full PII for payroll
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id                    SERIAL PRIMARY KEY,
  employer_id           INTEGER NOT NULL REFERENCES employers(id),
  employee_number       TEXT NOT NULL,            -- מספר עובד פנימי
  national_id           TEXT NOT NULL,            -- ת.ז
  first_name            TEXT NOT NULL,
  last_name             TEXT NOT NULL,
  full_name             TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
  birth_date            DATE,
  start_date            DATE NOT NULL,
  end_date              DATE,
  position              TEXT,
  department            TEXT,
  employment_type       TEXT NOT NULL CHECK (employment_type IN ('monthly','hourly','daily','freelance','foreign','youth','trainee')),
  work_percentage       NUMERIC(5,2) DEFAULT 100,
  base_salary           NUMERIC(14,2),            -- monthly base OR hourly rate
  hours_per_month       NUMERIC(6,2) DEFAULT 182, -- standard: 182 (42h/week × 4.33)
  bank_account_id       INTEGER,
  bank_code             TEXT,
  bank_branch           TEXT,
  bank_account_number   TEXT,
  pension_fund          TEXT,
  pension_fund_number   TEXT,
  study_fund            TEXT,
  study_fund_number     TEXT,
  tax_credits           NUMERIC(5,2) DEFAULT 2.25,  -- נקודות זיכוי (default resident Israeli)
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            TEXT,
  UNIQUE (employer_id, employee_number),
  UNIQUE (employer_id, national_id)
);

CREATE INDEX IF NOT EXISTS idx_employees_employer ON employees(employer_id, is_active);

-- ─────────────────────────────────────────────────────────────
-- wage_slips — one per employee per month
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wage_slips (
  id                    SERIAL PRIMARY KEY,
  employee_id           INTEGER NOT NULL REFERENCES employees(id),
  employer_id           INTEGER NOT NULL REFERENCES employers(id),

  -- Period
  period_year           INTEGER NOT NULL,
  period_month          INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_label          TEXT NOT NULL,            -- "2026-04"
  pay_date              DATE NOT NULL,

  -- Employment snapshot (frozen at time of slip)
  employee_number       TEXT NOT NULL,
  employee_name         TEXT NOT NULL,
  employee_national_id  TEXT NOT NULL,
  employer_legal_name   TEXT NOT NULL,
  employer_company_id   TEXT NOT NULL,
  employer_tax_file     TEXT NOT NULL,
  position              TEXT,
  department            TEXT,

  -- Hours
  hours_regular         NUMERIC(7,2) NOT NULL DEFAULT 0,
  hours_overtime_125    NUMERIC(7,2) NOT NULL DEFAULT 0,   -- 125%
  hours_overtime_150    NUMERIC(7,2) NOT NULL DEFAULT 0,   -- 150%
  hours_overtime_175    NUMERIC(7,2) NOT NULL DEFAULT 0,   -- 175% (weekend)
  hours_overtime_200    NUMERIC(7,2) NOT NULL DEFAULT 0,   -- 200% (holiday)
  hours_absence         NUMERIC(7,2) NOT NULL DEFAULT 0,
  hours_vacation        NUMERIC(7,2) NOT NULL DEFAULT 0,
  hours_sick            NUMERIC(7,2) NOT NULL DEFAULT 0,
  hours_reserve         NUMERIC(7,2) NOT NULL DEFAULT 0,   -- שירות מילואים

  -- Earnings (gross)
  base_pay              NUMERIC(14,2) NOT NULL DEFAULT 0,
  overtime_pay          NUMERIC(14,2) NOT NULL DEFAULT 0,
  vacation_pay          NUMERIC(14,2) NOT NULL DEFAULT 0,
  sick_pay              NUMERIC(14,2) NOT NULL DEFAULT 0,
  holiday_pay           NUMERIC(14,2) NOT NULL DEFAULT 0,
  bonuses               NUMERIC(14,2) NOT NULL DEFAULT 0,
  commissions           NUMERIC(14,2) NOT NULL DEFAULT 0,
  allowances_meal       NUMERIC(14,2) NOT NULL DEFAULT 0,
  allowances_travel     NUMERIC(14,2) NOT NULL DEFAULT 0,
  allowances_clothing   NUMERIC(14,2) NOT NULL DEFAULT 0,
  allowances_phone      NUMERIC(14,2) NOT NULL DEFAULT 0,
  other_earnings        NUMERIC(14,2) NOT NULL DEFAULT 0,
  gross_pay             NUMERIC(14,2) NOT NULL,

  -- Deductions (employee side)
  income_tax            NUMERIC(14,2) NOT NULL DEFAULT 0,         -- מס הכנסה
  bituach_leumi         NUMERIC(14,2) NOT NULL DEFAULT 0,         -- ביטוח לאומי
  health_tax            NUMERIC(14,2) NOT NULL DEFAULT 0,         -- מס בריאות
  pension_employee      NUMERIC(14,2) NOT NULL DEFAULT 0,         -- פנסיה — עובד
  study_fund_employee   NUMERIC(14,2) NOT NULL DEFAULT 0,         -- קרן השתלמות — עובד
  severance_employee    NUMERIC(14,2) NOT NULL DEFAULT 0,         -- פיצויים — עובד
  loans                 NUMERIC(14,2) NOT NULL DEFAULT 0,
  garnishments          NUMERIC(14,2) NOT NULL DEFAULT 0,          -- עיקולים
  other_deductions      NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_deductions      NUMERIC(14,2) NOT NULL,

  -- Net
  net_pay               NUMERIC(14,2) NOT NULL,

  -- Employer contributions (informational)
  pension_employer      NUMERIC(14,2) NOT NULL DEFAULT 0,
  study_fund_employer   NUMERIC(14,2) NOT NULL DEFAULT 0,
  severance_employer    NUMERIC(14,2) NOT NULL DEFAULT 0,
  bituach_leumi_employer NUMERIC(14,2) NOT NULL DEFAULT 0,
  health_tax_employer   NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- Balances (MUST appear on slip per law)
  vacation_balance      NUMERIC(7,2),                              -- ימי חופשה נותרים
  sick_balance          NUMERIC(7,2),                              -- ימי מחלה נותרים
  study_fund_balance    NUMERIC(14,2),                             -- יתרה בקרן השתלמות
  severance_balance     NUMERIC(14,2),                             -- יתרה פיצויים

  -- Year-to-date
  ytd_gross             NUMERIC(14,2),
  ytd_income_tax        NUMERIC(14,2),
  ytd_bituach_leumi     NUMERIC(14,2),
  ytd_pension           NUMERIC(14,2),

  -- Status
  status                TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','computed','approved','issued','paid','voided','amended')),
  pdf_path              TEXT,
  pdf_generated_at      TIMESTAMPTZ,
  emailed_at            TIMESTAMPTZ,
  viewed_by_employee_at TIMESTAMPTZ,

  -- Audit
  prepared_by           TEXT,
  approved_by           TEXT,
  approved_at           TIMESTAMPTZ,
  amendment_of          INTEGER REFERENCES wage_slips(id),        -- if amending a prior slip
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (employee_id, period_year, period_month),
  CHECK (net_pay = gross_pay - total_deductions)
);

CREATE INDEX IF NOT EXISTS idx_wage_slips_employee_period ON wage_slips(employee_id, period_year DESC, period_month DESC);
CREATE INDEX IF NOT EXISTS idx_wage_slips_employer_period ON wage_slips(employer_id, period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_wage_slips_status ON wage_slips(status);

-- ─────────────────────────────────────────────────────────────
-- employee_balances — snapshot of vacation/sick/study fund balances
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_balances (
  id                    SERIAL PRIMARY KEY,
  employee_id           INTEGER NOT NULL REFERENCES employees(id),
  snapshot_date         DATE NOT NULL,
  vacation_days_earned  NUMERIC(7,2) NOT NULL DEFAULT 0,
  vacation_days_used    NUMERIC(7,2) NOT NULL DEFAULT 0,
  vacation_days_balance NUMERIC(7,2) GENERATED ALWAYS AS (vacation_days_earned - vacation_days_used) STORED,
  sick_days_earned      NUMERIC(7,2) NOT NULL DEFAULT 0,
  sick_days_used        NUMERIC(7,2) NOT NULL DEFAULT 0,
  sick_days_balance     NUMERIC(7,2) GENERATED ALWAYS AS (sick_days_earned - sick_days_used) STORED,
  study_fund_balance    NUMERIC(14,2) DEFAULT 0,
  pension_balance       NUMERIC(14,2) DEFAULT 0,
  severance_balance     NUMERIC(14,2) DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, snapshot_date)
);

-- ─────────────────────────────────────────────────────────────
-- payroll_audit_log — complete audit of wage slip generation
-- (augments audit_log with payroll-specific context + retains >200 entries)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_audit_log (
  id                    BIGSERIAL PRIMARY KEY,
  event_type            TEXT NOT NULL,
  wage_slip_id          INTEGER REFERENCES wage_slips(id),
  employee_id           INTEGER REFERENCES employees(id),
  actor                 TEXT NOT NULL,
  actor_role            TEXT,
  ip_address            INET,
  user_agent            TEXT,
  details               JSONB,
  before_state          JSONB,
  after_state           JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_audit_wage_slip ON payroll_audit_log(wage_slip_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_audit_employee ON payroll_audit_log(employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_audit_time ON payroll_audit_log(created_at DESC);

INSERT INTO schema_migrations (version, name, checksum, notes)
VALUES ('007', 'payroll-wage-slip', 'wave1.5-b08', 'Payroll — employers, employees, wage_slips, balances, payroll_audit_log')
ON CONFLICT (version) DO UPDATE SET applied_at = NOW(), notes = EXCLUDED.notes || ' (re-applied)';

COMMIT;
