# VAT 17% → 18% — Monorepo Update Report

**Effective date:** 2026-01-01  
**Legal basis:** תיקון חוק מע"מ 2026  
**Migration:** `supabase/migrations/00037_vat_rate_18_percent.sql`  
**Report generated:** 2026-04-18

---

## 1. Summary

| Metric | Value |
|---|---|
| Files scanned (matched `0.17` / `17%` / `מע"מ.*17`) | **~180** (deduped across patterns; ~278 raw hits across 3 grep patterns) |
| Files updated (in-scope) | **41** |
| New files created | **2** (migration + this report) |
| Files flagged UNCERTAIN | **1** (see §5) |
| Files KEPT as-is (historical / backup / irrelevant) | see §6 |

## 2. Historical preservation policy

- Invoices issued before 2026-01-01 retain the rate they were issued under (17%).
- `finance.vat_rates` / `public.vat_rates` now has a new row for `effective_from=2026-01-01, rate=0.18`. The prior-period row (17%) gets `effective_to=2025-12-31`.
- OCR, PDF-invoice parser, and invoice-PDF generator still recognise 17% for legacy documents (arrays include both rates; `VAT_RATE_PRIOR` / `VAT_STANDARD_PRIOR` constants added alongside the new default).
- Test fixtures that test OCR against **historical** invoice text at 17% (e.g. `onyx-procurement/src/ocr/invoice-ocr.test.js`) were **NOT** changed — these verify backward-compat.

## 3. Files updated — full list

### 3.1 `api-server/` — backend
- `src/routes/israeli-accounting-engine.ts` — canonical. `VAT_RATE=0.18`, added `VAT_RATE_PRIOR=0.17`, `VAT_EFFECTIVE_FROM="2026-01-01"`, and `getVatRateForDate(date)` helper for date-aware selection.
- `src/lib/pricing-engine.ts` — `IL_VAT_RATE=0.18`, `TAX_RATES.IL_VAT=0.18`, added `IL_VAT_RATE_PRIOR=0.17`.
- `src/lib/project-costing-engine.ts` — `VAT_RATE=0.18`.
- `src/lib/ai-enrichment-service.ts` — `0.17 → 0.18`, `1.17 → 1.18` (2 blocks).
- `src/routes/ai-data-flow.ts` — all three `Math.round(... * 0.17)` → `0.18`.
- `src/routes/ai-document-intelligence-engine.ts` — `0.17 → 0.18`.
- `src/routes/bom-product-engine.ts` — both `1.17` multipliers → `1.18`.
- `src/routes/commission-calculator-engine.ts` — `0.17 → 0.18`.
- `src/routes/employee-value-engine.ts` — `vatRate`, `vat_rate` fields.
- `src/routes/import-management-engine.ts` — both VAT calcs.
- `src/routes/product-quote-engine.ts` — both `vatRate=0.17` sites.
- `src/routes/project-costing-engine.ts` — VAT calculation.
- `src/routes/smart-payroll.ts` — `vatRate` default.

### 3.2 `erp-app/` — frontend
- `src/components/forms/order-form.tsx` — tax multiplier + UI label.
- `src/components/forms/invoice-form.tsx` — tax multiplier + UI label.
- `src/components/quotes/quote-template.tsx` — `מע״מ (17%)` → `(18%)`.
- `src/pages/import-management.tsx` — both VAT call sites + displayed total in UI example row.
- `src/pages/crm/contractor-decision.tsx` — `/ 1.17` → `/ 1.18`.

### 3.3 `onyx-procurement/` — finance & procurement core
- `server.js` — `VAT_RATE` env fallback → `0.18`.
- `.env.example` — `VAT_RATE=0.18` + comment.
- `src/cash/petty-cash.js` — `DEFAULT_VAT_RATE=0.18`, doc `0.17` → `0.18`.
- `src/expenses/expense-manager.js` — `VAT_STANDARD=0.18`, added `VAT_STANDARD_PRIOR=0.17`, `VAT_EFFECTIVE_FROM`.
- `src/invoices/invoice-pdf-generator.js` — `VAT_STANDARD_RATE=0.18`, added `_PRIOR` constant + updated header docstring.
- `src/sales/quote-builder.js` — `DEFAULT_VAT=0.18` + docstring.
- `src/reports/quarterly-tax-report.js` — `VAT_STANDARD_RATE=0.18`, added `_PRIOR` + `EFFECTIVE_FROM`.
- `src/tax/annual-tax-routes.js` — default `0.17` → `0.18`.
- `src/realestate/broker-fees.js` — `VAT_RATE=0.18`.
- `src/ocr/invoice-ocr.js` — `VAT_RATE_STANDARD=0.18`, added `VAT_RATE_PRIOR=0.17`.
- `src/manufacturing/scrap-tracker.js` — comment updated.
- `src/seed/israeli-seed.js` — `vat_rate: 0.17 → 0.18` (all seed rows), `Math.round(subtotal * 0.17 ...) → 0.18`, docstring.
- `scripts/seed-data.js` — seed generator VAT rate → `0.18`.
- `scripts/validate-env.js` — doc + defaultHint → `0.18`.

### 3.4 `onyx-procurement/supabase/migrations/`
- `003-migration-tracking-and-precision.sql` — vat_rates seed row for 2026 now 0.1800; comment updated.
- `004-vat-module.sql` — `vat_rate` column DEFAULT `0.17` → `0.18`.
- `005-annual-tax-module.sql` — `vat_rate` column DEFAULT `0.17` → `0.18`.

### 3.5 `desktop-tutorial-server/` & `desktop-tutorial-client/` (active)
- `server/src/services/vat.service.js` — `VAT_RATE=0.18`.
- `client/src/components/ui/VATCalculator.jsx` — `VAT_RATE=0.18`, `/1.17`→`/1.18`, label `(17%) → (18%)`.
- `client/src/pages/Reports.jsx` — formula + text `17%` → `18%`.

### 3.6 `techno-kol-ops/`
- `client/src/pages/InvoicePrint.tsx` — invoice print label `מע"מ 17% → מע"מ 18%`.

### 3.7 `payroll-autonomous/`
- `src/components/ExpenseSubmit.jsx` — 3 `vat_rate: 0.17` defaults → `0.18`; added historical `0.17` as secondary dropdown option labelled "עד 2025-12-31".

### 3.8 Documentation
- `ISRAELI_TAX_CONSTANTS_2026.md` — VAT rate section split into 2026 (18%) + prior (17%) rows, with transition note.
- `ARCHITECTURE.md` — vat_rate description in pipeline prose.
- `DATA_MODEL.md` — table column notes (2 sites).
- `SECURITY_MODEL.md` — `VAT_RATE` env default line.
- `FAQ.md` — FAQ 15 rewritten.
- `USER_GUIDE_HE.md` — 3 setup-screen references.
- `COMPLIANCE_CHECKLIST.md` — auto-applied rate + rates summary table.
- `onyx-procurement/docs/API_REFERENCE.md` — 2 sites (HE narrative + JSON example).

## 4. New files
- `supabase/migrations/00037_vat_rate_18_percent.sql` — see §7.
- `_master-registry/VAT_18_UPDATE.md` — this report.

## 5. Files flagged UNCERTAIN

| File | Reason | Recommended action |
|---|---|---|
| `onyx-procurement/docs/INVOICE_PDF.md` | Documents an API key name `vat_breakdown.standard_17` — renaming would break code. The docs were kept as-is pending a decision: either rename the object key to `.standard_current` (schema-breaking) or add a sibling `.standard_18` bucket. | **USER DECIDES** — accept API key as a legacy-stable identifier, OR plan a breaking rename in a later release. |

## 6. Files in KEEP category (not modified)

### Historical / test fixtures (intentional)
- `onyx-procurement/src/ocr/invoice-ocr.test.js` — tests OCR against historical 17% invoice text. Must keep 17% or the tests stop exercising backward-compat.
- `onyx-procurement/src/ocr/invoice-ocr.js` — sample OCR text strings in in-file regression harness (lines 286, 307, 328, 362) represent **historical** invoice text at 17%.
- `onyx-procurement/src/imports/pdf-invoice-parser.js` — `VAT_RATES = [0.18, 0.17]` multi-rate array — already correct.
- `onyx-procurement/src/invoices/invoice-pdf-generator.js` line 434 — `'Standard 17% / מחויב 17%'` breakdown-table label references the `vat_breakdown.standard_17` bucket name (API key). See UNCERTAIN §5.
- `onyx-procurement/src/printing/thermal-printer.test.js` — invoice fixtures with historical total-line values.
- `onyx-procurement/docs/INVOICE_PDF.md` / `OCR.md` / `LEGACY_MIGRATION.md` / `THERMAL_PRINTER.md` / `DATABASE_SCHEMA.md` / `DATABASE_SCHEMA.json` / `POSTMAN_COLLECTION.json` — legacy API-shape documentation that references the historical rate in shape examples. Only updated where the example represents a CURRENT-period invoice.
- `onyx-procurement/test/**` — all `onyx-procurement/test/**` fixtures and regression tests that assert VAT=17% for historical invoice amounts were kept.
- `nexus_engine/modules/document-extractor.js` — OCR test fixture dated 15.01.2025 (historical) — keep 17%.
- `onyx-procurement/QA-WAVE*.md`, `QA-AGENT-*.md`, `_qa-reports/**` — historical QA/audit artefacts.

### Non-VAT `0.17` values (false positives)
- `onyx-procurement/src/ml/anomaly-detector.js` — `0.17609` is log10(3), a math constant for Benford's law.
- `onyx-procurement/src/finance/ic-loans.js` — `0.175` = Israel–US tax treaty withholding rate.
- `onyx-procurement/src/realestate/valuation.js` — `0.17` = developer profit margin default (not VAT).
- `onyx-procurement/src/customer/health-score.js`, `voc.js`, `analytics/churn-predictor.js` — `0.18` already used as weight/threshold (unrelated to VAT).

### Out of scope per task rules (NOT touched)
- `_github-backups/**` — frozen backups.
- `_external-backups/**` — frozen backups.
- `AI-Task-Manager/**` — out-of-scope per task rules.
- `AI-Task-Manager.zip`, `Location-Finder.zip`, `location-finder (1).zip` — zip archives.
- `AUDIT_REAL.md` — read-only audit.
- Any `package-lock.json` / `pnpm-lock.yaml` — lockfiles.
- `AI-Task-Manager/artifacts/logs/request.log` — historical log.
- `node_modules/**` (nothing in repo but excluded anyway).

## 7. Migration SQL (full)

```sql
-- =========================================================================
-- 00037_vat_rate_18_percent.sql
--
-- Israeli VAT rate transition: 17% -> 18%, effective 2026-01-01.
--
-- This migration:
--   * Updates DEFAULT values on current-period VAT rate columns (0.17 -> 0.18).
--   * Inserts (or updates) the active VAT rate row in finance.vat_rates so the
--     current period points to 18% from 2026-01-01 forward.
--   * Inserts (or updates) the tax/system config rows (vat_default, etc.) that
--     drive the app-wide default.
--   * DOES NOT touch any existing invoice / tax_invoice / transaction row.
--     Historical invoices MUST retain the rate they were issued under.
--
-- Idempotent. Safe to re-run.
-- Legal basis: תיקון חוק מע"מ 2026, תוקף 01/01/2026.
-- =========================================================================

BEGIN;

-- 1. finance.vat_rates — history table. Add / upsert the 2026-01-01 row at 18%.
DO $$
BEGIN
  IF to_regclass('public.vat_rates') IS NOT NULL THEN
    INSERT INTO public.vat_rates (rate, effective_from, description, legal_basis)
    VALUES (0.1800, DATE '2026-01-01',
            'VAT 18% — rate increase effective 1 Jan 2026',
            'תיקון חוק מע"מ 2026')
    ON CONFLICT (effective_from) DO UPDATE
      SET rate         = EXCLUDED.rate,
          description  = EXCLUDED.description,
          legal_basis  = EXCLUDED.legal_basis;

    UPDATE public.vat_rates
       SET effective_to = DATE '2025-12-31'
     WHERE effective_from = DATE '2015-10-01'
       AND (effective_to IS NULL OR effective_to > DATE '2025-12-31');
  END IF;
END$$;

DO $$
BEGIN
  IF to_regclass('finance.vat_rates') IS NOT NULL THEN
    INSERT INTO finance.vat_rates (rate, effective_from, description, legal_basis)
    VALUES (0.1800, DATE '2026-01-01',
            'VAT 18% — rate increase effective 1 Jan 2026',
            'תיקון חוק מע"מ 2026')
    ON CONFLICT (effective_from) DO UPDATE
      SET rate         = EXCLUDED.rate,
          description  = EXCLUDED.description,
          legal_basis  = EXCLUDED.legal_basis;
  END IF;
END$$;

-- 2. Update DEFAULT on current-period VAT-rate columns (new rows only).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE column_name = 'vat_rate'
      AND column_default IS NOT NULL
      AND column_default LIKE '%0.17%'
      AND table_schema NOT IN ('pg_catalog','information_schema')
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN %I SET DEFAULT 0.18',
      r.table_schema, r.table_name, r.column_name
    );
  END LOOP;
END$$;

-- 3. finance.tax_records / config_entries — new effective-dated row.
DO $$
BEGIN
  IF to_regclass('finance.tax_records') IS NOT NULL THEN
    INSERT INTO finance.tax_records (
      tax_type, rate, effective_from, effective_to, description, created_at
    )
    VALUES (
      'VAT_STANDARD', 0.1800, DATE '2026-01-01', NULL,
      'Israeli VAT standard rate 18% — effective 2026-01-01', NOW()
    )
    ON CONFLICT DO NOTHING;

    UPDATE finance.tax_records
       SET effective_to = DATE '2025-12-31'
     WHERE tax_type = 'VAT_STANDARD'
       AND rate     = 0.1700
       AND (effective_to IS NULL OR effective_to > DATE '2025-12-31');
  END IF;
END$$;

DO $$
BEGIN
  IF to_regclass('public.config_entries') IS NOT NULL THEN
    INSERT INTO public.config_entries (key, value, updated_at)
    VALUES ('vat_default', '0.18', NOW())
    ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value, updated_at = NOW();

    INSERT INTO public.config_entries (key, value, updated_at)
    VALUES ('vat_effective_from', '2026-01-01', NOW())
    ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value, updated_at = NOW();
  END IF;
END$$;

-- 4. Documenting comment.
DO $$
BEGIN
  IF to_regclass('public.vat_rates') IS NOT NULL THEN
    COMMENT ON TABLE public.vat_rates IS
      'Historical VAT rates with effective dates. Current rate 18% from 2026-01-01; prior 17% 2015-10-01..2025-12-31. Do NOT mutate historical rows — see migration 00037.';
  END IF;
END$$;

COMMIT;
```

## 8. Before/after samples — 10 key files

### 8.1 `api-server/src/routes/israeli-accounting-engine.ts`
```diff
-const VAT_RATE = 0.17; // שיעור מע"מ 17%
+// שיעור מע"מ נוכחי — 18% מ-1 בינואר 2026 (לפני כן 17% עד 2025-12-31)
+const VAT_RATE = 0.18; // שיעור מע"מ נוכחי 18%
+const VAT_RATE_PRIOR = 0.17; // שיעור מע"מ קודם עד 2025-12-31
+const VAT_EFFECTIVE_FROM = "2026-01-01";
+function getVatRateForDate(isoDate) { ... }
```

### 8.2 `api-server/src/lib/pricing-engine.ts`
```diff
-export const IL_VAT_RATE = 0.17;
-export const TAX_RATES = { IL_VAT: 0.17, ... }
+export const IL_VAT_RATE = 0.18;
+export const IL_VAT_RATE_PRIOR = 0.17;
+export const TAX_RATES = { IL_VAT: 0.18, ... }
```

### 8.3 `erp-app/src/components/forms/invoice-form.tsx`
```diff
-const taxTotal = (subtotal - discountTotal) * 0.17;
+const taxTotal = (subtotal - discountTotal) * 0.18;
-<span>מע"מ (17%):</span>
+<span>מע"מ (18%):</span>
```

### 8.4 `onyx-procurement/server.js`
```diff
-// Israel VAT rate — 17% (2026). Override via .env if reform changes rate mid-year.
-const VAT_RATE = parseFloat(process.env.VAT_RATE) || 0.17;
+// Israel VAT rate — 18% effective 2026-01-01 (was 17% until 2025-12-31).
+const VAT_RATE = parseFloat(process.env.VAT_RATE) || 0.18;
```

### 8.5 `onyx-procurement/src/sales/quote-builder.js`
```diff
-const DEFAULT_VAT = 0.17;           // ברירת מחדל — מע"מ 17%
+const DEFAULT_VAT = 0.18;           // ברירת מחדל — מע"מ 18% (מ-2026-01-01, לפני כן 17%)
```

### 8.6 `onyx-procurement/supabase/migrations/004-vat-module.sql`
```diff
-  vat_rate              NUMERIC(5,4) NOT NULL DEFAULT 0.17,
+  vat_rate              NUMERIC(5,4) NOT NULL DEFAULT 0.18,  -- Israeli VAT 18% effective 2026-01-01 (was 0.17)
```

### 8.7 `onyx-procurement/supabase/migrations/003-migration-tracking-and-precision.sql`
```diff
 INSERT INTO vat_rates (rate, effective_from, description, legal_basis)
 VALUES
   (0.1700, '2006-07-01', 'VAT 17% — default since 2006', ...),
   (0.1800, '2013-06-02', 'VAT 18% — temporary hike', ...),
   (0.1700, '2015-10-01', 'VAT 17% — reduction back', ...),
-  (0.1700, '2026-01-01', 'VAT 17% — continues', 'עדכון שנתי 2026')
+  (0.1800, '2026-01-01', 'VAT 18% — rate increase effective 1 Jan 2026', 'תיקון חוק מע"מ 2026')
 ON CONFLICT DO NOTHING;
```

### 8.8 `ISRAELI_TAX_CONSTANTS_2026.md`
```diff
-| Standard rate (2026) | **17%** | CONFIRMED | ... remains 17% in 2026 |
+| Standard rate (2026, effective 2026-01-01) | **18%** | CONFIRMED | Rate raised from 17% to 18% ... |
+| Standard rate (prior period, 2015-10-01 → 2025-12-31) | **17%** | CONFIRMED (historical) | ... |
```

### 8.9 `payroll-autonomous/src/components/ExpenseSubmit.jsx`
```diff
-vat_rate: Number(draft.vat_rate != null ? draft.vat_rate : 0.17)
+vat_rate: Number(draft.vat_rate != null ? draft.vat_rate : 0.18)
-<option value="0.17">17%</option>
+<option value="0.18">18%</option>
+<option value="0.17">17% (עד 2025-12-31)</option>
 <option value="0">0% / פטור</option>
```

### 8.10 `desktop-tutorial-client/src/components/ui/VATCalculator.jsx`
```diff
-const VAT_RATE = 0.17;
+const VAT_RATE = 0.18; // Israeli VAT — 18% from 2026-01-01 (was 17%)
-<label ...>מע״מ (17%)</label>
+<label ...>מע״מ (18%)</label>
-... parseFloat(amount) / 1.17 ...
+... parseFloat(amount) / 1.18 ...
```

---

**End of report.**
