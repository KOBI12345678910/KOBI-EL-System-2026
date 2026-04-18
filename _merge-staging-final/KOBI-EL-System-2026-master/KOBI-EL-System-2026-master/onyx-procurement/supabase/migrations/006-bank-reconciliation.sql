-- ═══════════════════════════════════════════════════════════════
-- ONYX PROCUREMENT — Migration 006
-- Bank Reconciliation Module (B-11) — Wave 1.5
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- bank_accounts — company bank accounts
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_accounts (
  id                    SERIAL PRIMARY KEY,
  account_name          TEXT NOT NULL,
  bank_name             TEXT NOT NULL,
  bank_code             TEXT,                       -- e.g. '10'=Leumi, '11'=Discount, '12'=Poalim, '13'=Igud, '17'=Mercantile, '14'=Otsar, '20'=Mizrahi-Tfahot, '31'=Beinleumi
  branch_number         TEXT,
  account_number        TEXT NOT NULL,
  iban                  TEXT,
  swift_code            TEXT,
  currency              TEXT NOT NULL DEFAULT 'ILS',
  account_type          TEXT CHECK (account_type IN ('checking','savings','credit','loan','investment','foreign')),
  purpose               TEXT,                       -- 'operating','payroll','tax','reserves'
  is_primary            BOOLEAN NOT NULL DEFAULT FALSE,
  active                BOOLEAN NOT NULL DEFAULT TRUE,
  current_balance       NUMERIC(14,2) DEFAULT 0,
  available_balance     NUMERIC(14,2) DEFAULT 0,
  last_statement_date   DATE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bank_code, branch_number, account_number)
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_active ON bank_accounts(active);

-- ─────────────────────────────────────────────────────────────
-- bank_statements — imported statement files
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_statements (
  id                    SERIAL PRIMARY KEY,
  bank_account_id       INTEGER NOT NULL REFERENCES bank_accounts(id),
  statement_date        DATE NOT NULL,
  period_start          DATE NOT NULL,
  period_end            DATE NOT NULL,
  opening_balance       NUMERIC(14,2) NOT NULL,
  closing_balance       NUMERIC(14,2) NOT NULL,
  transaction_count     INTEGER NOT NULL DEFAULT 0,
  source_format         TEXT NOT NULL CHECK (source_format IN ('csv','mt940','camt053','ofx','excel','manual','api')),
  source_file_path      TEXT,
  source_file_checksum  TEXT,
  imported_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  imported_by           TEXT,
  status                TEXT NOT NULL DEFAULT 'imported'
                          CHECK (status IN ('imported','reconciling','reconciled','discrepancy','archived')),
  notes                 TEXT,
  UNIQUE (bank_account_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_bank_statements_account ON bank_statements(bank_account_id, period_start);

-- ─────────────────────────────────────────────────────────────
-- bank_transactions — individual lines from statements
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_transactions (
  id                    BIGSERIAL PRIMARY KEY,
  bank_account_id       INTEGER NOT NULL REFERENCES bank_accounts(id),
  bank_statement_id     INTEGER REFERENCES bank_statements(id),
  transaction_date      DATE NOT NULL,
  value_date            DATE,
  description           TEXT NOT NULL,
  long_description      TEXT,
  counterparty_name     TEXT,
  counterparty_account  TEXT,
  reference_number      TEXT,
  amount                NUMERIC(14,2) NOT NULL,      -- positive = credit (in), negative = debit (out)
  balance_after         NUMERIC(14,2),
  transaction_type      TEXT CHECK (transaction_type IN ('transfer','check','cash_deposit','cash_withdrawal','fee','interest','standing_order','direct_debit','card','loan','fx','other')),
  check_number          TEXT,
  currency              TEXT NOT NULL DEFAULT 'ILS',
  reconciled            BOOLEAN NOT NULL DEFAULT FALSE,
  reconciled_at         TIMESTAMPTZ,
  reconciled_by         TEXT,
  matched_to_type       TEXT,                        -- 'customer_payment','supplier_payment','payroll','tax','manual','unmatched'
  matched_to_id         TEXT,
  match_confidence      NUMERIC(3,2),                -- 0..1
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_data              JSONB                        -- original row for audit
);

CREATE INDEX IF NOT EXISTS idx_bank_tx_account_date ON bank_transactions(bank_account_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_bank_tx_statement ON bank_transactions(bank_statement_id);
CREATE INDEX IF NOT EXISTS idx_bank_tx_reconciled ON bank_transactions(reconciled) WHERE NOT reconciled;
CREATE INDEX IF NOT EXISTS idx_bank_tx_matched ON bank_transactions(matched_to_type, matched_to_id);

-- ─────────────────────────────────────────────────────────────
-- reconciliation_matches — many-to-many matches
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reconciliation_matches (
  id                    SERIAL PRIMARY KEY,
  bank_transaction_id   BIGINT NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
  target_type           TEXT NOT NULL CHECK (target_type IN ('customer_invoice','customer_payment','supplier_payment','purchase_order','payroll','tax_payment','manual')),
  target_id             INTEGER NOT NULL,
  match_type            TEXT NOT NULL CHECK (match_type IN ('exact','partial','manual','auto','suggested')),
  confidence            NUMERIC(3,2) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  match_criteria        JSONB,                       -- {amount_diff, date_diff, name_similarity}
  matched_amount        NUMERIC(14,2) NOT NULL,
  approved              BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by           TEXT,
  approved_at           TIMESTAMPTZ,
  rejected              BOOLEAN NOT NULL DEFAULT FALSE,
  rejected_reason       TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            TEXT,
  UNIQUE (bank_transaction_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_recon_matches_tx ON reconciliation_matches(bank_transaction_id);
CREATE INDEX IF NOT EXISTS idx_recon_matches_target ON reconciliation_matches(target_type, target_id);

-- ─────────────────────────────────────────────────────────────
-- reconciliation_discrepancies — mismatches flagged for review
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reconciliation_discrepancies (
  id                    SERIAL PRIMARY KEY,
  bank_account_id       INTEGER NOT NULL REFERENCES bank_accounts(id),
  bank_statement_id     INTEGER REFERENCES bank_statements(id),
  discrepancy_type      TEXT NOT NULL CHECK (discrepancy_type IN ('unmatched_bank_tx','unmatched_ledger','amount_mismatch','date_mismatch','missing_statement','duplicate_entry')),
  amount                NUMERIC(14,2),
  description           TEXT,
  severity              TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  status                TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','escalated','written_off')),
  resolution            TEXT,
  resolved_at           TIMESTAMPTZ,
  resolved_by           TEXT,
  bank_transaction_id   BIGINT REFERENCES bank_transactions(id),
  ledger_entry_ref      TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recon_disc_account ON reconciliation_discrepancies(bank_account_id, status);

-- ─────────────────────────────────────────────────────────────
-- View: unreconciled balance per account
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_unreconciled_summary AS
SELECT
  ba.id AS bank_account_id,
  ba.account_name,
  ba.bank_name,
  COUNT(*) FILTER (WHERE NOT bt.reconciled) AS unreconciled_count,
  SUM(bt.amount) FILTER (WHERE NOT bt.reconciled) AS unreconciled_amount,
  MAX(bt.transaction_date) FILTER (WHERE NOT bt.reconciled) AS oldest_unreconciled_date
FROM bank_accounts ba
LEFT JOIN bank_transactions bt ON bt.bank_account_id = ba.id
WHERE ba.active
GROUP BY ba.id, ba.account_name, ba.bank_name;

INSERT INTO schema_migrations (version, name, checksum, notes)
VALUES ('006', 'bank-reconciliation', 'wave1.5-b11', 'Bank recon — accounts, statements, transactions, matches, discrepancies')
ON CONFLICT (version) DO UPDATE SET applied_at = NOW(), notes = EXCLUDED.notes || ' (re-applied)';

COMMIT;
