# AGENT-209 — Quote → Order Conversion Patch

**Date:** 2026-04-29 — **Worktree:** `objective-merkle-40ff93` — **Predecessor:** Agent 159

## 1. Problem

No HTTP endpoint exists to convert an approved quote into a sales order. Three parallel quote tables coexist; zero conversion routes. Conversion only happens implicitly via the in-process listener `handleQuotationApproved` in `cross-module-sync.ts:585`, which writes a generic JSON row to `entity_records` — **not** into `commercial.sales_orders`. The UI button "יצירת הזמנה" (`builder-seed.ts:113,164`) has no API target.

## 2. The 3 Parallel Quote Tables

| # | Table | Defined In | Owner Router | Used By |
|---|-------|-----------|--------------|---------|
| 1 | **`commercial.quotes`** (canonical) | `supabase/migrations/00000_master_schema.sql:467-492` | (none) | `commercial.sales_orders.quote_id` FK; `rpc_approve_quote` |
| 2 | **`crm_quotes`** | `routes/crm-ultimate.ts:250-290` (runtime DDL) | `routes/crm-ultimate.ts` `/api/crm/quotes` | CRM Ultimate dashboard, agent KPIs |
| 3 | **`quotes`** (bare) | `app.ts:727-737` (runtime bootstrap) | `dedicated-entity-routes.ts` | Reports & analytics only |

Plus `sales_quotations` (referenced by `quote-builder.ts` PDF/discount flow) — pricing/PDF satellite.

**Provenance constraint:** `commercial.sales_orders.quote_id` is `bigint references commercial.quotes(id)`. Conversion must read from #1 — entries from #2/#3 must first be **mirrored** into #1.

## 3. Why the Existing Listener is Insufficient

`api-server/src/lib/cross-module-sync.ts:585-624` (`handleQuotationApproved`):
- Writes to `entityRecordsTable` (JSONB), not `commercial.sales_orders`.
- No HTTP entry point.
- Idempotency uses `data.source_quote_id`, not the FK column.
- Does not copy line items.

We keep it as a notification side-effect; canonical creation goes through the new endpoint.

## 4. Canonical Conversion Path

```
HTTP   POST /api/quotes/:id/convert-to-order
HTTP   POST /api/commercial/sales-orders/from-quote/:id   (alias)
```

Handler steps:
1. **Resolve** the quote: `commercial.quotes` → `crm_quotes` → `quotes`. If found in #2/#3, **mirror** into #1 (idempotent on `quote_number`).
2. **Validate state**: must be `Approved` (per `chk_quote_state` in `00003`). Admin can pass `force=true`.
3. **Idempotency**: existing non-cancelled SO with this `quote_id` → return `200 { already_converted: true }`.
4. **Insert** into `commercial.sales_orders` in one statement, snapping `quote_id` and totals.
5. **Update** source quote to `state='ConvertedToProject'` (terminal sales-path state).
6. **Audit** via `logAudit` (parity with `sales-orders.ts:186`).

## 5. Patch — New File `api-server/src/routes/commercial/quote-to-order.ts`

```typescript
import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { authMiddleware } from "../../middleware/auth";
import { logAudit } from "../../lib/audit-log";

const router = Router();
router.use(authMiddleware);

type QuoteSource = "commercial" | "crm" | "legacy";
interface ResolvedQuote {
  source: QuoteSource; id: number; customer_id: number; currency: string;
  subtotal: number; discount_total: number; vat_total: number; grand_total: number;
  state: string; approval_status: string; customer_notes: string | null;
}

async function nextOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  try {
    const r = await db.execute(sql.raw(`
      select coalesce(max(case when order_number ~ '^SO-[0-9]{4}-[0-9]+$'
        then (split_part(order_number,'-',3))::int else 0 end),0)+1 as next_seq
      from commercial.sales_orders where order_number like 'SO-${year}-%'`));
    const n = Number((r.rows?.[0] as { next_seq?: number })?.next_seq ?? 1);
    return `SO-${year}-${String(n).padStart(5, "0")}`;
  } catch { return `SO-${year}-${Date.now()}`; }
}

// Resolves quote across the 3 tables; mirrors crm/legacy into commercial.quotes.
async function resolveQuote(rawId: number, userId: number | null): Promise<ResolvedQuote | null> {
  const c = await db.execute(sql`
    select id, customer_id, currency, subtotal, discount_total, vat_total,
           grand_total, state, approval_status, customer_notes
    from commercial.quotes where id = ${rawId} limit 1`);
  const cRow = (c.rows ?? [])[0] as Record<string, unknown> | undefined;
  if (cRow) return mapRow("commercial", cRow);

  const crm = await db.execute(sql`
    select id, customer_id, quote_number, status, subtotal, discount_amount,
           vat_amount, total_with_vat, notes
    from crm_quotes where id = ${rawId} limit 1`).catch(() => ({ rows: [] }));
  const crmRow = (crm.rows ?? [])[0] as Record<string, unknown> | undefined;
  if (crmRow) {
    const qn = String(crmRow.quote_number ?? `CRM-${rawId}`);
    const state = String(crmRow.status ?? "draft").toLowerCase() === "approved" ? "Approved" : "Draft";
    const m = await db.execute(sql`
      insert into commercial.quotes (
        quote_number, customer_id, subtotal, discount_total, vat_total, grand_total,
        currency, approval_status, state, customer_notes, created_by, updated_by)
      values (${qn}, ${Number(crmRow.customer_id) || null},
        ${Number(crmRow.subtotal) || 0}, ${Number(crmRow.discount_amount) || 0},
        ${Number(crmRow.vat_amount) || 0}, ${Number(crmRow.total_with_vat) || 0}, 'ILS',
        ${state === "Approved" ? "approved" : "draft"}, ${state},
        ${crmRow.notes ?? null}, ${userId}, ${userId})
      on conflict (quote_number) do update set updated_at = now()
      returning id, customer_id, currency, subtotal, discount_total, vat_total,
                grand_total, state, approval_status, customer_notes`);
    return mapRow("crm", (m.rows ?? [])[0] as Record<string, unknown>);
  }

  const lg = await db.execute(sql`
    select id, quote_number, customer_id, total_amount, status, notes
    from quotes where id = ${rawId} limit 1`).catch(() => ({ rows: [] }));
  const lgRow = (lg.rows ?? [])[0] as Record<string, unknown> | undefined;
  if (lgRow) {
    const qn = String(lgRow.quote_number ?? `LEG-${rawId}`);
    const state = String(lgRow.status ?? "draft").toLowerCase() === "approved" ? "Approved" : "Draft";
    const m = await db.execute(sql`
      insert into commercial.quotes (quote_number, customer_id, grand_total, currency,
        approval_status, state, customer_notes, created_by, updated_by)
      values (${qn}, ${Number(lgRow.customer_id) || null},
        ${Number(lgRow.total_amount) || 0}, 'ILS',
        ${state === "Approved" ? "approved" : "draft"}, ${state},
        ${lgRow.notes ?? null}, ${userId}, ${userId})
      on conflict (quote_number) do update set updated_at = now()
      returning id, customer_id, currency, subtotal, discount_total, vat_total,
                grand_total, state, approval_status, customer_notes`);
    return mapRow("legacy", (m.rows ?? [])[0] as Record<string, unknown>);
  }
  return null;
}

function mapRow(source: QuoteSource, r: Record<string, unknown>): ResolvedQuote {
  return {
    source, id: Number(r.id), customer_id: Number(r.customer_id),
    currency: String(r.currency ?? "ILS"),
    subtotal: Number(r.subtotal ?? 0), discount_total: Number(r.discount_total ?? 0),
    vat_total: Number(r.vat_total ?? 0), grand_total: Number(r.grand_total ?? 0),
    state: String(r.state ?? "Draft"),
    approval_status: String(r.approval_status ?? "draft"),
    customer_notes: (r.customer_notes as string) ?? null,
  };
}

// POST /:id/convert-to-order
// Body: { force?, expected_delivery?, payment_terms?, shipping_address?,
//         billing_address?, notes? }
router.post("/:id/convert-to-order", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "מזהה הצעה לא תקין" }); return;
  }
  const userId = Number(req.userId) || null;
  const force = Boolean(req.body?.force);

  try {
    const quote = await resolveQuote(id, userId);
    if (!quote) {
      res.status(404).json({ error: "הצעה לא נמצאה באף אחת מהטבלאות" }); return;
    }

    const existing = await db.execute(sql`
      select id, order_number, status from commercial.sales_orders
      where quote_id = ${quote.id} and status <> 'cancelled' and deleted_at is null
      limit 1`);
    const existingRow = (existing.rows ?? [])[0];
    if (existingRow) {
      res.status(200).json({ already_converted: true, sales_order: existingRow }); return;
    }

    if (quote.state !== "Approved" && !force) {
      res.status(409).json({
        error: "ניתן להמיר רק הצעה שאושרה (state=Approved)",
        current_state: quote.state,
        hint: "Use POST /api/quotes/:id/approve first, or pass { force: true } as admin.",
      }); return;
    }

    const order_number = await nextOrderNumber();
    const subtotal = quote.subtotal;
    const discount_total = quote.discount_total;
    const vat_total = quote.vat_total;
    const total_amount = subtotal - discount_total;
    const total_with_vat = total_amount + vat_total;
    const vat_rate = vat_total > 0 && total_amount > 0
      ? Number((vat_total / total_amount).toFixed(4)) : 0.18;

    const ins = await db.execute(sql`
      insert into commercial.sales_orders (
        order_number, customer_id, quote_id, status, order_date, expected_delivery,
        subtotal, discount_total, vat_rate, vat_total, total_amount, total_with_vat,
        currency, payment_terms, shipping_address, billing_address, notes,
        customer_notes, is_active, metadata, created_by, updated_by)
      values (
        ${order_number}, ${quote.customer_id}, ${quote.id}, 'draft',
        ${new Date().toISOString().slice(0,10)},
        ${req.body?.expected_delivery ?? null},
        ${subtotal}, ${discount_total}, ${vat_rate}, ${vat_total},
        ${total_amount}, ${total_with_vat}, ${quote.currency},
        ${req.body?.payment_terms ?? null},
        ${req.body?.shipping_address ? JSON.stringify(req.body.shipping_address) : null}::jsonb,
        ${req.body?.billing_address ? JSON.stringify(req.body.billing_address) : null}::jsonb,
        ${req.body?.notes ?? null}, ${quote.customer_notes}, true,
        ${JSON.stringify({ converted_from_quote: quote.id, source_table: quote.source })}::jsonb,
        ${userId}, ${userId})
      returning *`);
    const so = (ins.rows ?? [])[0] as { id: number; order_number: string };

    // Mark canonical quote terminal; Agent 210 will fill converted_project_id
    // once the project-from-order flow lands.
    await db.execute(sql`
      update commercial.quotes set state = 'ConvertedToProject',
        updated_at = now(), updated_by = ${userId} where id = ${quote.id}`);

    if (quote.source === "crm") {
      await db.execute(sql`update crm_quotes set status='converted', updated_at=now()
                           where id=${id}`).catch(() => {});
    } else if (quote.source === "legacy") {
      await db.execute(sql`update quotes set status='converted', updated_at=now()
                           where id=${id}`).catch(() => {});
    }

    await logAudit({
      user_id: userId, table_name: "commercial_sales_orders", record_id: so.id,
      action: "INSERT",
      new_values: {
        converted_from_quote: quote.id, source_table: quote.source,
        order_number: so.order_number, grand_total: total_with_vat,
      } as Record<string, unknown>,
      ip_address: req.ip ?? null,
      notes: `quote→order conversion (source=${quote.source})`,
    });

    res.status(201).json({
      sales_order: so,
      converted_from: { quote_id: quote.id, source: quote.source },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("foreign key")) {
      res.status(400).json({ error: "לקוח לא נמצא — לא ניתן ליצור הזמנה" }); return;
    }
    console.error("[quote-to-order:convert]", err);
    res.status(500).json({ error: "שגיאה בהמרת הצעה להזמנה" });
  }
});

export default router;
```

## 6. Wiring

Edit `api-server/src/routes/commercial/index.ts`:
```typescript
import quoteToOrderRouter from "./quote-to-order";
commercialRouter.use("/sales-orders/from-quote", quoteToOrderRouter);
```

Edit `api-server/src/routes/index.ts`:
```typescript
import quoteToOrderRouter from "./commercial/quote-to-order";
router.use("/quotes", quoteToOrderRouter); // POST /api/quotes/:id/convert-to-order
```

Optional `routes/commercial/sales-orders.ts` patch — in `POST /` short-circuit when only `quote_id` is supplied:
```typescript
if (d.quote_id && !d.subtotal && !d.customer_id) {
  return res.redirect(307, `/api/quotes/${d.quote_id}/convert-to-order`);
}
```

## 7. State Machine Alignment

Per `00003:11-13`: `quote.state ∈ {Draft, Sent, UnderReview, Approved, Rejected, ConvertedToProject}`.
Per `00043:142`: `sales_order.status ∈ {draft, confirmed, in_fulfillment, shipped, invoiced, closed, cancelled}`.

| Before | After (quote) | After (sales_order) |
|--------|---------------|---------------------|
| `Approved` | `ConvertedToProject` | `draft` (new row) |
| any other | rejected unless `force=true` | n/a |

Mirrors the precondition at `00003:67` in `commercial.rpc_approve_quote`.

## 8. Testing

- **Unit:** mock `db.execute`; verify resolution precedence (commercial > CRM > legacy).
- **Integration:** seed an approved quote in each table, POST `/api/quotes/:id/convert-to-order`, assert one row in `commercial.sales_orders` with `quote_id` populated.
- **Idempotency:** call twice — second returns `200 { already_converted: true }`.
- **State guard:** non-approved quote returns `409` with `current_state` in body.
- **Closest existing test:** `api-server/src/__tests__/integration/financial-flow.test.ts:249-294` — extend with HTTP variant.

## 9. Follow-ups

- **Agent 210:** add `commercial.sales_order_lines` and copy `commercial.quote_lines` rows during conversion. Currently lines live only as JSONB `crm_quotes.items`; canonical sales_orders has no line table.
- **Schema unification:** plan `00046_unify_quote_tables.sql` — backfill from `crm_quotes` + bare `quotes`, drop the redundancies, remove the runtime `CREATE TABLE IF NOT EXISTS` in `crm-ultimate.ts:250` and `app.ts:727`.
- **Listener cleanup:** after this endpoint ships, refactor `handleQuotationApproved` to call the inner handler instead of writing to `entity_records`. Removes the dual write path.

## 10. Files Touched

| Path | Change |
|------|--------|
| `api-server/src/routes/commercial/quote-to-order.ts` | **NEW** (§5) |
| `api-server/src/routes/commercial/index.ts` | mount `/sales-orders/from-quote` alias |
| `api-server/src/routes/index.ts` | mount top-level `/quotes` alias |
| `api-server/src/routes/commercial/sales-orders.ts` | optional 307 redirect on bare `quote_id` POSTs |

No SQL migration required — `commercial.quotes` and `commercial.sales_orders` already exist with the FK in `00043:140`. Mirror inserts target only existing columns.

## 11. Key References

- Quote tables: `supabase/migrations/00000_master_schema.sql:467-492`; `routes/crm-ultimate.ts:250-290`; `app.ts:727-737`
- Sales-orders router: `routes/commercial/sales-orders.ts:151-209`
- Sales-orders schema: `supabase/migrations/00043_commercial_domain_complete.sql:134-177`
- State-machine constraint: `supabase/migrations/00003_action_rpcs_and_state_machines.sql:11-13`
- Existing approval RPC: `supabase/migrations/00003_action_rpcs_and_state_machines.sql:51-83`
- Existing event handler: `lib/cross-module-sync.ts:585-624`
- Data-flow declaration: `lib/data-flow-engine.ts:908-918`
- UI buttons referencing the gap: `routes/builder-seed.ts:113, 164`

— end of report —
