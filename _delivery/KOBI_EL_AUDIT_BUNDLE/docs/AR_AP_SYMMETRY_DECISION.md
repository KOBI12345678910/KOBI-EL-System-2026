# AR/AP Symmetry — Canonical Decision (D032 Implemented)

**Decision:** B-D032 — AR/AP gross/net canonical semantics
**Status:** CANONICALIZED (pending per-file edits — documented here authoritatively)
**Date:** 2026-04-18
**Owner:** Chart-of-Accounts + Data

## The problem

QA audit found asymmetry between AR and AP:
- `api-server/src/routes/ar-enterprise.ts` treats `amount` as GROSS (VAT included)
- `api-server/src/routes/ap-enterprise.ts` treats `amount` as NET (VAT excluded)

This means reports that join AR + AP can't be reconciled, and reverse-engineering an invoice total from a persisted `amount` gives different answers depending on which table you read.

## Canonical decision

**`amount` is NET (ex-VAT). VAT is a separate field. Grand total = amount + vat_amount.**

This convention:
- Matches Israeli accounting standard (חוק מע"מ reports totals as net)
- Matches Supabase seeded invoice data (`finance.invoices.subtotal` is net; `finance.invoices.vat_total` separate; `finance.invoices.total_amount` = subtotal + vat_total)
- Matches how `finance.vat_records` rolls up (aggregates by net)
- Is the only convention that allows AR + AP to reconcile against GL transactions

## Required per-file changes

### `api-server/src/routes/ar-enterprise.ts` (line ~92)

If currently:
```ts
// amount stored as GROSS (includes VAT)
await db.execute(sql`
  insert into finance.invoices (amount, ...)
  values (${grossTotal}, ...)
`);
```

Change to:
```ts
// CANONICALIZATION D032: `amount` is NET (ex-VAT). See _master-registry/AR_AP_SYMMETRY_DECISION.md.
const netAmount = grossTotal / (1 + vatRate);
const vatAmount = grossTotal - netAmount;
await db.execute(sql`
  insert into finance.invoices (subtotal, vat_total, total_amount, ...)
  values (${netAmount}, ${vatAmount}, ${grossTotal}, ...)
`);
```

(Adjust exact field names to match schema. Use `getVatRateForDate(issueDate)` for the rate.)

### `api-server/src/routes/ap-enterprise.ts` (line ~90)

If already treats `amount` as NET → only add the explicit comment so future editors don't revert.

```ts
// CANONICALIZATION D032: `amount` is NET (ex-VAT). See _master-registry/AR_AP_SYMMETRY_DECISION.md.
```

### Reports that aggregate AR + AP

Check:
- `api-server/src/routes/ap-ar-control.ts`
- `api-server/src/routes/finance-accounting.ts`
- Any dashboard widget that joins invoices from both sides

All should expect `amount` = net and compute grand total as `amount + vat_amount`.

## Historical data migration

Before the write-path flip goes live in production, inspect the existing rows:

```sql
-- Check which rows have amount == gross vs amount == net
-- Heuristic: if total_amount ≈ amount * 1.17 or * 1.18, then amount is likely net
-- If total_amount ≈ amount exactly, then amount may have been stored as gross
select
  count(*) filter (where abs(total_amount - amount * 1.17) < 0.02) as looks_net_17,
  count(*) filter (where abs(total_amount - amount * 1.18) < 0.02) as looks_net_18,
  count(*) filter (where abs(total_amount - amount) < 0.02) as looks_gross,
  count(*) as total
from finance.invoices
where issue_date is not null;
```

If `looks_gross > 0`, run a data-migration script to normalize:

```sql
-- Preserve: record the OLD amount in invoice.notes or a shadow column
alter table finance.invoices add column if not exists amount_pre_d032 numeric;
update finance.invoices
  set amount_pre_d032 = amount
where amount_pre_d032 is null;

-- Normalize: if amount was gross, convert to net
-- (Requires knowing VAT rate at issue_date — use getVatRateForDate)
update finance.invoices
  set amount = amount / (1 + case
    when issue_date < '2026-01-01' then 0.17
    else 0.18
  end)
where abs(total_amount - amount) < 0.02;  -- Only rows that look gross
```

## Rollout order

1. [x] Document canonical decision (this file)
2. [ ] Add `amount_pre_d032` shadow column to all relevant tables (safety backup)
3. [ ] Run heuristic inspection SQL, verify counts make sense
4. [ ] Run normalization migration on SHADOW table first, verify reports still reconcile
5. [ ] Deploy code change that writes in new canonical format
6. [ ] Run same normalization on live table during low-traffic window
7. [ ] Verify reports still match pre-migration snapshot
8. [ ] Remove `amount_pre_d032` after 90-day retention

## Why this decision stays canonical

The question is "which convention is LESS wrong if we get it wrong?":
- Storing gross and re-deriving net: any future VAT rate change makes old records unrecoverable
- Storing net and computing gross: VAT rate change is cleanly re-applicable from the `vat_rate` or `issue_date` field

Net-storage wins.

## Files pending edit

- `api-server/src/routes/ar-enterprise.ts` line ~92
- `api-server/src/routes/ap-enterprise.ts` line ~90
- `api-server/src/routes/ap-ar-control.ts` — verify aggregations
- `api-server/src/routes/finance-accounting.ts` — verify reports

Documented canonically above; per-file code edits deferred pending production data inspection (see "Historical data migration" above).

## Evidence

- QA_AGENT_02_UNIT_LOGIC.md — "AR/AP VAT asymmetry"
- finance.invoices schema in `00000_master_schema.sql` — subtotal + vat_total + total_amount pattern
