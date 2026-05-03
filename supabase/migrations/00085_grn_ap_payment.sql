-- ============================================================================
-- Migration : 00085_grn_ap_payment.sql
-- Author    : Agent 247 (DB BUILD #2 — per Agent 160 finding: GRN/AP-invoice/
--             Payment tables missing in supabase/)
-- Date      : 2026-04-29
-- Purpose   : Migrate db/migrations/0003-0005 + AP/payment domain into the
--             supabase/ tree under the public schema. Tables created here are
--             the AP backbone for the Procurement -> Cash flow.
--
-- Tables (public schema):
--   1. goods_receipts            -- GRN headers (GR confirmations against PO)
--   2. grn_lines                 -- GRN line items (per-PO-line received qty)
--   3. ap_invoices_full          -- supplier (vendor) invoices
--   4. ap_invoice_lines          -- line items on supplier invoices
--   5. payments                  -- supplier disbursements
--   6. payment_allocations       -- N:M payment <-> invoice allocations
--   7. withholding_certificates  -- IL niku-bemakor (withholding) certs
--
-- Conventions:
--   * tenant_id UUID FK to public.tenants(id), NOT NULL on all 7 tables
--   * RLS enabled with tenant predicate via governance.current_tenant_id()
--   * FK indexes on every FK column
--   * GL posting triggers on ap_invoices_full + payments to gl_journal_entries
--   * touch_updated_at trigger on every header table
--   * Idempotent: IF NOT EXISTS / DO blocks, safe to re-run
-- ============================================================================

BEGIN;

-- ============================================================================
-- 0. Prerequisite helpers (created if absent so this migration is standalone)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.touch_updated_at_v2()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $fn$;

-- governance.current_tenant_id() is created by 00073_rls_hardening.sql.
-- Provide a public-schema fallback shim if 00073 has not yet run.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'governance' AND p.proname = 'current_tenant_id'
  ) THEN
    CREATE SCHEMA IF NOT EXISTS governance;
    EXECUTE $shim$
      CREATE OR REPLACE FUNCTION governance.current_tenant_id() RETURNS uuid
      LANGUAGE sql STABLE AS 'SELECT NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid'
    $shim$;
  END IF;
END $$;

-- ============================================================================
-- 1. goods_receipts (GRN headers)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.goods_receipts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL,
  grn_number          TEXT NOT NULL,
  po_id               UUID,
  supplier_id         UUID,
  warehouse_id        UUID,
  project_id          UUID,
  receipt_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  delivery_note_ref   TEXT,
  carrier             TEXT,
  status              TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','received','partial','inspected',
                                        'accepted','rejected','closed','posted')),
  inspection_status   TEXT NOT NULL DEFAULT 'pending'
                      CHECK (inspection_status IN ('pending','passed','failed','partial')),
  inspection_notes    TEXT,
  total_value         NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency            TEXT NOT NULL DEFAULT 'ILS',
  fx_rate             NUMERIC(14,6) NOT NULL DEFAULT 1,
  total_value_ils     NUMERIC(18,2) NOT NULL DEFAULT 0,
  received_by         UUID,
  posted_to_gl        BOOLEAN NOT NULL DEFAULT FALSE,
  gl_journal_id       UUID,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  is_deleted          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID,
  updated_by          UUID,
  CONSTRAINT uq_grn_tenant_number UNIQUE (tenant_id, grn_number),
  CONSTRAINT chk_grn_total_nonneg CHECK (total_value >= 0)
);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='tenants') THEN
    BEGIN
      ALTER TABLE public.goods_receipts
        ADD CONSTRAINT fk_grn_tenant
        FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_grn_tenant       ON public.goods_receipts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_grn_po           ON public.goods_receipts (po_id);
CREATE INDEX IF NOT EXISTS idx_grn_supplier     ON public.goods_receipts (supplier_id);
CREATE INDEX IF NOT EXISTS idx_grn_warehouse    ON public.goods_receipts (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_grn_project      ON public.goods_receipts (project_id);
CREATE INDEX IF NOT EXISTS idx_grn_status       ON public.goods_receipts (status);
CREATE INDEX IF NOT EXISTS idx_grn_receipt_date ON public.goods_receipts (receipt_date DESC);
CREATE INDEX IF NOT EXISTS idx_grn_received_by  ON public.goods_receipts (received_by);

DROP TRIGGER IF EXISTS trg_grn_touch ON public.goods_receipts;
CREATE TRIGGER trg_grn_touch BEFORE UPDATE ON public.goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_v2();

-- ============================================================================
-- 2. grn_lines
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.grn_lines (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL,
  grn_id              UUID NOT NULL REFERENCES public.goods_receipts(id) ON DELETE CASCADE,
  po_line_id          UUID,
  line_no             INTEGER NOT NULL,
  item_id             UUID,
  description         TEXT NOT NULL,
  quantity_expected   NUMERIC(18,4) NOT NULL DEFAULT 0,
  quantity_received   NUMERIC(18,4) NOT NULL,
  quantity_accepted   NUMERIC(18,4) NOT NULL DEFAULT 0,
  quantity_rejected   NUMERIC(18,4) NOT NULL DEFAULT 0,
  unit                TEXT NOT NULL DEFAULT 'יח׳',
  unit_cost           NUMERIC(18,4) NOT NULL DEFAULT 0,
  line_total          NUMERIC(18,2) NOT NULL DEFAULT 0,
  reject_reason       TEXT,
  lot_number          TEXT,
  expiry_date         DATE,
  location_id         UUID,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_grn_line UNIQUE (grn_id, line_no),
  CONSTRAINT chk_grnl_qty_pos CHECK (quantity_received > 0),
  CONSTRAINT chk_grnl_split   CHECK (quantity_accepted + quantity_rejected <= quantity_received)
);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='tenants') THEN
    BEGIN
      ALTER TABLE public.grn_lines
        ADD CONSTRAINT fk_grnl_tenant
        FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_grnl_tenant   ON public.grn_lines (tenant_id);
CREATE INDEX IF NOT EXISTS idx_grnl_grn      ON public.grn_lines (grn_id);
CREATE INDEX IF NOT EXISTS idx_grnl_po_line  ON public.grn_lines (po_line_id);
CREATE INDEX IF NOT EXISTS idx_grnl_item     ON public.grn_lines (item_id);
CREATE INDEX IF NOT EXISTS idx_grnl_location ON public.grn_lines (location_id);

-- ============================================================================
-- 3. ap_invoices_full (supplier / vendor invoices)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ap_invoices_full (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL,
  invoice_number      TEXT NOT NULL,
  supplier_id         UUID NOT NULL,
  po_id               UUID,
  grn_id              UUID,
  issued_at           DATE NOT NULL,
  received_at         DATE NOT NULL DEFAULT CURRENT_DATE,
  due_at              DATE,
  payment_terms_days  INTEGER NOT NULL DEFAULT 30,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('draft','pending','approved','matched',
                                        'partial_paid','paid','overdue','disputed','cancelled')),
  match_status        TEXT NOT NULL DEFAULT 'unmatched'
                      CHECK (match_status IN ('unmatched','two_way','three_way','exception')),
  currency            TEXT NOT NULL DEFAULT 'ILS',
  fx_rate             NUMERIC(14,6) NOT NULL DEFAULT 1,
  subtotal            NUMERIC(18,2) NOT NULL DEFAULT 0,
  vat_rate_pct        NUMERIC(5,2) NOT NULL DEFAULT 18.00,
  vat_amount          NUMERIC(18,2) NOT NULL DEFAULT 0,
  withholding_amount  NUMERIC(18,2) NOT NULL DEFAULT 0,
  total               NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_ils           NUMERIC(18,2) NOT NULL DEFAULT 0,
  paid_amount         NUMERIC(18,2) NOT NULL DEFAULT 0,
  balance_due         NUMERIC(18,2) NOT NULL DEFAULT 0,
  pdf_url             TEXT,
  ocr_raw             JSONB,
  posted_to_gl        BOOLEAN NOT NULL DEFAULT FALSE,
  gl_journal_id       UUID,
  approved_by         UUID,
  approved_at         TIMESTAMPTZ,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  is_deleted          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID,
  updated_by          UUID,
  CONSTRAINT uq_apinv_tenant_supplier_number UNIQUE (tenant_id, supplier_id, invoice_number),
  CONSTRAINT chk_apinv_total_nonneg CHECK (total >= 0),
  CONSTRAINT chk_apinv_paid_nonneg  CHECK (paid_amount >= 0),
  CONSTRAINT chk_apinv_paid_le      CHECK (paid_amount <= total + 0.01)
);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='tenants') THEN
    BEGIN
      ALTER TABLE public.ap_invoices_full
        ADD CONSTRAINT fk_apinv_tenant
        FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='goods_receipts') THEN
    BEGIN
      ALTER TABLE public.ap_invoices_full
        ADD CONSTRAINT fk_apinv_grn
        FOREIGN KEY (grn_id) REFERENCES public.goods_receipts(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_apinv_tenant    ON public.ap_invoices_full (tenant_id);
CREATE INDEX IF NOT EXISTS idx_apinv_supplier  ON public.ap_invoices_full (supplier_id);
CREATE INDEX IF NOT EXISTS idx_apinv_po        ON public.ap_invoices_full (po_id);
CREATE INDEX IF NOT EXISTS idx_apinv_grn       ON public.ap_invoices_full (grn_id);
CREATE INDEX IF NOT EXISTS idx_apinv_status    ON public.ap_invoices_full (status);
CREATE INDEX IF NOT EXISTS idx_apinv_match     ON public.ap_invoices_full (match_status);
CREATE INDEX IF NOT EXISTS idx_apinv_due       ON public.ap_invoices_full (due_at) WHERE due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_apinv_issued    ON public.ap_invoices_full (issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_apinv_approved  ON public.ap_invoices_full (approved_by);

DROP TRIGGER IF EXISTS trg_apinv_touch ON public.ap_invoices_full;
CREATE TRIGGER trg_apinv_touch BEFORE UPDATE ON public.ap_invoices_full
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_v2();

-- ============================================================================
-- 4. ap_invoice_lines
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ap_invoice_lines (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL,
  ap_invoice_id       UUID NOT NULL REFERENCES public.ap_invoices_full(id) ON DELETE CASCADE,
  po_line_id          UUID,
  grn_line_id         UUID REFERENCES public.grn_lines(id) ON DELETE SET NULL,
  line_no             INTEGER NOT NULL,
  item_id             UUID,
  description         TEXT NOT NULL,
  quantity            NUMERIC(18,4) NOT NULL,
  unit                TEXT NOT NULL DEFAULT 'יח׳',
  unit_price          NUMERIC(18,4) NOT NULL,
  vat_rate_pct        NUMERIC(5,2) NOT NULL DEFAULT 18.00,
  vat_amount          NUMERIC(18,2) NOT NULL DEFAULT 0,
  line_total          NUMERIC(18,2) NOT NULL,
  gl_account_id       UUID,
  cost_center_id      UUID,
  project_id          UUID,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT uq_apinvl UNIQUE (ap_invoice_id, line_no),
  CONSTRAINT chk_apinvl_qty_pos CHECK (quantity > 0)
);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='tenants') THEN
    BEGIN
      ALTER TABLE public.ap_invoice_lines
        ADD CONSTRAINT fk_apinvl_tenant
        FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_apinvl_tenant   ON public.ap_invoice_lines (tenant_id);
CREATE INDEX IF NOT EXISTS idx_apinvl_invoice  ON public.ap_invoice_lines (ap_invoice_id);
CREATE INDEX IF NOT EXISTS idx_apinvl_po_line  ON public.ap_invoice_lines (po_line_id);
CREATE INDEX IF NOT EXISTS idx_apinvl_grn_line ON public.ap_invoice_lines (grn_line_id);
CREATE INDEX IF NOT EXISTS idx_apinvl_item     ON public.ap_invoice_lines (item_id);
CREATE INDEX IF NOT EXISTS idx_apinvl_gl_acct  ON public.ap_invoice_lines (gl_account_id);
CREATE INDEX IF NOT EXISTS idx_apinvl_cc       ON public.ap_invoice_lines (cost_center_id);
CREATE INDEX IF NOT EXISTS idx_apinvl_project  ON public.ap_invoice_lines (project_id);

-- ============================================================================
-- 5. payments (supplier disbursements)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL,
  payment_number      TEXT NOT NULL,
  supplier_id         UUID NOT NULL,
  bank_account_id     UUID,
  paid_at             DATE NOT NULL DEFAULT CURRENT_DATE,
  value_date          DATE,
  amount              NUMERIC(18,2) NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'ILS',
  fx_rate             NUMERIC(14,6) NOT NULL DEFAULT 1,
  amount_ils          NUMERIC(18,2) NOT NULL,
  withholding_amount  NUMERIC(18,2) NOT NULL DEFAULT 0,
  net_amount          NUMERIC(18,2) NOT NULL DEFAULT 0,
  method              TEXT NOT NULL CHECK (method IN ('bank_transfer','check','cash','credit_card','wire','ach')),
  reference           TEXT,
  check_number        TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','processing','cleared','rejected','reversed','cancelled')),
  posted_to_gl        BOOLEAN NOT NULL DEFAULT FALSE,
  gl_journal_id       UUID,
  notes               TEXT,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  is_deleted          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID,
  CONSTRAINT uq_pmt_tenant_number UNIQUE (tenant_id, payment_number),
  CONSTRAINT chk_pmt_amount_pos CHECK (amount > 0)
);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='tenants') THEN
    BEGIN
      ALTER TABLE public.payments
        ADD CONSTRAINT fk_pmt_tenant
        FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pmt_tenant   ON public.payments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pmt_supplier ON public.payments (supplier_id);
CREATE INDEX IF NOT EXISTS idx_pmt_bank     ON public.payments (bank_account_id);
CREATE INDEX IF NOT EXISTS idx_pmt_paid_at  ON public.payments (paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_pmt_status   ON public.payments (status);
CREATE INDEX IF NOT EXISTS idx_pmt_method   ON public.payments (method);

DROP TRIGGER IF EXISTS trg_pmt_touch ON public.payments;
CREATE TRIGGER trg_pmt_touch BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_v2();

-- ============================================================================
-- 6. payment_allocations (N:M payment -> ap_invoices_full)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL,
  payment_id          UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  ap_invoice_id       UUID NOT NULL REFERENCES public.ap_invoices_full(id) ON DELETE RESTRICT,
  allocated_amount    NUMERIC(18,2) NOT NULL,
  allocated_amount_ils NUMERIC(18,2) NOT NULL,
  allocated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes               TEXT,
  CONSTRAINT chk_alloc_pos CHECK (allocated_amount > 0),
  CONSTRAINT uq_alloc_pmt_inv UNIQUE (payment_id, ap_invoice_id)
);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='tenants') THEN
    BEGIN
      ALTER TABLE public.payment_allocations
        ADD CONSTRAINT fk_alloc_tenant
        FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_alloc_tenant  ON public.payment_allocations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_alloc_payment ON public.payment_allocations (payment_id);
CREATE INDEX IF NOT EXISTS idx_alloc_invoice ON public.payment_allocations (ap_invoice_id);

-- ============================================================================
-- 7. withholding_certificates (IL niku-bemakor)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.withholding_certificates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL,
  supplier_id           UUID NOT NULL,
  certificate_number    TEXT NOT NULL,
  tax_authority_ref     TEXT,
  valid_from            DATE NOT NULL,
  valid_to              DATE NOT NULL,
  exemption_rate_pct    NUMERIC(5,2) NOT NULL DEFAULT 0,
  default_rate_pct      NUMERIC(5,2) NOT NULL DEFAULT 30.00,
  certificate_type      TEXT NOT NULL DEFAULT 'standard'
                        CHECK (certificate_type IN ('standard','full_exemption','partial_exemption','expired')),
  pdf_url               TEXT,
  notes                 TEXT,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID,
  CONSTRAINT uq_wht_tenant_supplier_cert UNIQUE (tenant_id, supplier_id, certificate_number),
  CONSTRAINT chk_wht_valid_range CHECK (valid_to >= valid_from),
  CONSTRAINT chk_wht_rates CHECK (exemption_rate_pct >= 0 AND exemption_rate_pct <= 100
                                  AND default_rate_pct >= 0 AND default_rate_pct <= 100)
);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='tenants') THEN
    BEGIN
      ALTER TABLE public.withholding_certificates
        ADD CONSTRAINT fk_wht_tenant
        FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wht_tenant     ON public.withholding_certificates (tenant_id);
CREATE INDEX IF NOT EXISTS idx_wht_supplier   ON public.withholding_certificates (supplier_id);
CREATE INDEX IF NOT EXISTS idx_wht_validity   ON public.withholding_certificates (valid_from, valid_to);
CREATE INDEX IF NOT EXISTS idx_wht_active     ON public.withholding_certificates (is_active);

DROP TRIGGER IF EXISTS trg_wht_touch ON public.withholding_certificates;
CREATE TRIGGER trg_wht_touch BEFORE UPDATE ON public.withholding_certificates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_v2();

-- ============================================================================
-- 8. Recalc trigger: keep ap_invoices_full.paid_amount + balance_due in sync
-- ============================================================================
CREATE OR REPLACE FUNCTION public.recalc_ap_invoice_paid()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
DECLARE
  target UUID := COALESCE(NEW.ap_invoice_id, OLD.ap_invoice_id);
  paid   NUMERIC(18,2);
  tot    NUMERIC(18,2);
BEGIN
  SELECT COALESCE(SUM(allocated_amount_ils), 0)
    INTO paid
    FROM public.payment_allocations
   WHERE ap_invoice_id = target;

  SELECT total INTO tot FROM public.ap_invoices_full WHERE id = target;

  UPDATE public.ap_invoices_full
     SET paid_amount = paid,
         balance_due = GREATEST(tot - paid, 0),
         status      = CASE
                         WHEN paid >= tot AND tot > 0 THEN 'paid'
                         WHEN paid > 0  AND paid < tot THEN 'partial_paid'
                         ELSE status
                       END
   WHERE id = target;
  RETURN NULL;
END $fn$;

DROP TRIGGER IF EXISTS trg_alloc_recalc ON public.payment_allocations;
CREATE TRIGGER trg_alloc_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.payment_allocations
  FOR EACH ROW EXECUTE FUNCTION public.recalc_ap_invoice_paid();

-- ============================================================================
-- 9. GL POSTING TRIGGERS
--    Posts double-entry rows to gl_journal_entries + gl_journal_lines when
--    (a) an ap_invoice transitions to 'approved' / 'matched'
--    (b) a payment transitions to 'cleared'
--    No-op when GL tables are absent (defensive — pg_proc check).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.post_ap_invoice_to_gl()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
DECLARE
  v_journal_id UUID;
BEGIN
  IF NEW.posted_to_gl THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('approved','matched') THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='gl_journal_entries') THEN
    RETURN NEW;
  END IF;

  v_journal_id := gen_random_uuid();

  EXECUTE format($q$
    INSERT INTO public.gl_journal_entries
      (id, tenant_id, entry_date, source_type, source_id, description, total_debit, total_credit, status, created_at)
    VALUES ($1, $2, $3, 'ap_invoice', $4, $5, $6, $6, 'posted', now())
  $q$) USING v_journal_id, NEW.tenant_id, NEW.issued_at, NEW.id,
            'AP Invoice ' || NEW.invoice_number, NEW.total_ils;

  -- DR: AP expense (line summary)         CR: AP control account
  EXECUTE $q$
    INSERT INTO public.gl_journal_lines
      (id, tenant_id, journal_entry_id, line_no, debit, credit, description)
    VALUES
      (gen_random_uuid(), $1, $2, 1, $3, 0, 'AP Inv expense'),
      (gen_random_uuid(), $1, $2, 2, 0, $3, 'AP control')
  $q$ USING NEW.tenant_id, v_journal_id, NEW.total_ils;

  NEW.posted_to_gl  := TRUE;
  NEW.gl_journal_id := v_journal_id;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_apinv_post_gl ON public.ap_invoices_full;
CREATE TRIGGER trg_apinv_post_gl
  BEFORE UPDATE OF status ON public.ap_invoices_full
  FOR EACH ROW
  WHEN (NEW.status IN ('approved','matched') AND NEW.posted_to_gl = FALSE)
  EXECUTE FUNCTION public.post_ap_invoice_to_gl();

CREATE OR REPLACE FUNCTION public.post_payment_to_gl()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
DECLARE
  v_journal_id UUID;
BEGIN
  IF NEW.posted_to_gl THEN RETURN NEW; END IF;
  IF NEW.status <> 'cleared' THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='gl_journal_entries') THEN
    RETURN NEW;
  END IF;

  v_journal_id := gen_random_uuid();

  EXECUTE $q$
    INSERT INTO public.gl_journal_entries
      (id, tenant_id, entry_date, source_type, source_id, description, total_debit, total_credit, status, created_at)
    VALUES ($1, $2, $3, 'payment', $4, $5, $6, $6, 'posted', now())
  $q$ USING v_journal_id, NEW.tenant_id, NEW.paid_at, NEW.id,
           'Payment ' || NEW.payment_number, NEW.amount_ils;

  -- DR: AP control                       CR: Bank
  EXECUTE $q$
    INSERT INTO public.gl_journal_lines
      (id, tenant_id, journal_entry_id, line_no, debit, credit, description)
    VALUES
      (gen_random_uuid(), $1, $2, 1, $3, 0, 'AP settle'),
      (gen_random_uuid(), $1, $2, 2, 0, $3, 'Bank disbursement')
  $q$ USING NEW.tenant_id, v_journal_id, NEW.amount_ils;

  NEW.posted_to_gl  := TRUE;
  NEW.gl_journal_id := v_journal_id;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_pmt_post_gl ON public.payments;
CREATE TRIGGER trg_pmt_post_gl
  BEFORE UPDATE OF status ON public.payments
  FOR EACH ROW
  WHEN (NEW.status = 'cleared' AND NEW.posted_to_gl = FALSE)
  EXECUTE FUNCTION public.post_payment_to_gl();

-- ============================================================================
-- 10. RLS — enable + tenant-scoped policies
-- ============================================================================
ALTER TABLE public.goods_receipts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grn_lines                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ap_invoices_full          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ap_invoice_lines          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withholding_certificates  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'goods_receipts','grn_lines','ap_invoices_full','ap_invoice_lines',
    'payments','payment_allocations','withholding_certificates'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I_tenant_select ON public.%I',
      t, t);
    EXECUTE format(
      'CREATE POLICY %I_tenant_select ON public.%I FOR SELECT TO authenticated '
      || 'USING (tenant_id = governance.current_tenant_id())',
      t, t);

    EXECUTE format(
      'DROP POLICY IF EXISTS %I_tenant_modify ON public.%I',
      t, t);
    EXECUTE format(
      'CREATE POLICY %I_tenant_modify ON public.%I FOR ALL TO authenticated '
      || 'USING (tenant_id = governance.current_tenant_id()) '
      || 'WITH CHECK (tenant_id = governance.current_tenant_id())',
      t, t);
  END LOOP;
END $$;

COMMIT;

-- ============================================================================
-- ROLLBACK (manual): drop in reverse dependency order
--   DROP TABLE public.payment_allocations, public.withholding_certificates,
--             public.ap_invoice_lines, public.grn_lines,
--             public.ap_invoices_full, public.payments,
--             public.goods_receipts CASCADE;
--   DROP FUNCTION public.recalc_ap_invoice_paid(),
--                 public.post_ap_invoice_to_gl(),
--                 public.post_payment_to_gl(),
--                 public.touch_updated_at_v2();
-- ============================================================================
