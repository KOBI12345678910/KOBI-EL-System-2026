# AGENT-207 — AP Invoice + 3-Way Match Patch

**Service**: ONYX_PROCUREMENT (port 3100)
**Date**: 2026-04-29
**Scope**: Concrete fix for the gap flagged by AGENT-160 §5 — `POST /api/invoices` (AP) + 3-way match + GL posting.
**Verdict**: Ready-to-apply patch. Three artifacts: (a) migration `00072_ap_invoices_and_three_way_match.sql`, (b) route block in `onyx-procurement/server.js`, (c) GL posting trigger.

---

## 1. State of the world (verified)

| Asset | Where | Status |
|---|---|---|
| `procurement.supplier_invoices` (header) | `supabase/migrations/00000_master_schema.sql:748-765` | EXISTS — 18 cols, no lines table, no GL link |
| `procurement.supplier_invoice_lines` | none | **MISSING** |
| `procurement.goods_receipts` + `goods_receipt_lines` | `supabase/migrations/00047_procurement_domain_complete.sql:123-189` | EXISTS — usable as GRN source |
| `procurement.three_way_matches` | `supabase/migrations/00047_procurement_domain_complete.sql:213-251` | EXISTS — table + indexes only, **no logic** populates it |
| `finance.gl_transactions` | `supabase/migrations/00000_master_schema.sql:1483-1497` | EXISTS — `account_code`, `debit_amount`, `credit_amount`, `linked_entity_type/id` |
| `POST /api/invoices` route (AP) | `onyx-procurement/server.js` | **MISSING** (grep zero hits) |
| State machine `supplier_invoice` | `src/pipeline/state-machines.js` | **MISSING** (only customer-side `invoice` exists) |
| `db/migrations/0004_invoices_and_payments.sql` | repo root | UNLOADED — Supabase reads only `supabase/migrations/`. Useful as reference; do **not** include verbatim — its `invoices` table collides with `finance.invoices` (already taken by AR). |

Critical: AGENT-160 §5 said "no `supplier_invoices` table in live supabase migrations". That is **wrong** — the header table exists in `00000_master_schema.sql:748`. Lines, status enum, three-way logic, and GL posting are the real gaps.

---

## 2. SQL Migration — `supabase/migrations/00072_ap_invoices_and_three_way_match.sql`

```sql
-- =========================================================
-- 00072 — AP Invoice lines + 3-way match logic + GL posting
-- =========================================================
-- Builds on 00000 (procurement.supplier_invoices header) and
-- 00047 (goods_receipts + three_way_matches table). Adds the
-- missing lines table, tightens supplier_invoices.state with
-- AP-specific values, materializes three_way_match logic as an
-- RPC, and adds a GL posting trigger that writes to
-- finance.gl_transactions on state transition to 'posted'.

begin;

-- ─── 2.1  AP-specific state values on supplier_invoices ────────
alter table procurement.supplier_invoices
  drop constraint if exists supplier_invoices_state_check;

alter table procurement.supplier_invoices
  add constraint supplier_invoices_state_check
  check (state in (
    'draft',                  -- captured, awaiting OCR/manual entry
    'pending_3way_match',     -- header complete, lines entered, awaiting match run
    'matched',                -- 3-way match passed within tolerance
    'discrepancy',            -- variance exceeded — needs manual review
    'approved_for_payment',   -- matched + approved (clears AP gate)
    'posted',                 -- GL entry written; AP balance increased
    'paid',                   -- payment fully applied
    'cancelled',              -- voided before posting
    'on_hold',                -- disputed or awaiting credit memo
    'reversed'                -- reversal posted after-the-fact
  ));

alter table procurement.supplier_invoices
  add column if not exists posted_at        timestamptz,
  add column if not exists posted_by_user_id bigint references governance.users_profile(id),
  add column if not exists gl_transaction_id bigint,                       -- back-ref to finance.gl_transactions header
  add column if not exists three_way_match_id bigint references procurement.three_way_matches(id),
  add column if not exists tolerance_pct    numeric(6,4) not null default 0.02,    -- 2% default
  add column if not exists ocr_raw          jsonb,
  add column if not exists pdf_url          text,
  add column if not exists fx_rate          numeric(14,6) not null default 1,
  add column if not exists grand_total_ils  numeric(18,2),
  add column if not exists paid_amount      numeric(18,2) not null default 0,
  add column if not exists project_id       bigint references execution.projects(id),
  add column if not exists internal_notes   text;

create index if not exists idx_si_state         on procurement.supplier_invoices(state);
create index if not exists idx_si_due_date      on procurement.supplier_invoices(due_date) where state in ('posted','approved_for_payment');
create index if not exists idx_si_po_id         on procurement.supplier_invoices(po_id);
create unique index if not exists uq_si_supplier_invnum
  on procurement.supplier_invoices(supplier_id, supplier_invoice_number)
  where is_active is distinct from false;

-- ─── 2.2  Lines table (was missing) ───────────────────────────
create table if not exists procurement.supplier_invoice_lines (
  id                    bigserial primary key,
  invoice_id            bigint not null references procurement.supplier_invoices(id) on delete cascade,
  line_number           integer not null,
  po_line_id            bigint references procurement.purchase_order_lines(id),
  goods_receipt_line_id bigint references procurement.goods_receipt_lines(id),
  material_id           bigint,
  description           text not null,
  quantity              numeric(18,4) not null,
  unit_of_measure       text,
  unit_price            numeric(18,4) not null,
  line_subtotal         numeric(18,2) not null,
  vat_percent           numeric(9,4) not null default 18,
  vat_amount            numeric(18,2) not null default 0,
  line_total            numeric(18,2) not null,
  expense_account_code  text,                            -- override default expense GL code
  project_id            bigint references execution.projects(id),
  cost_center_code      text,
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique(invoice_id, line_number)
);

create index if not exists idx_sil_invoice    on procurement.supplier_invoice_lines(invoice_id);
create index if not exists idx_sil_po_line    on procurement.supplier_invoice_lines(po_line_id);
create index if not exists idx_sil_gr_line    on procurement.supplier_invoice_lines(goods_receipt_line_id);
create index if not exists idx_sil_project    on procurement.supplier_invoice_lines(project_id);

create trigger trg_sil_updated_at
  before update on procurement.supplier_invoice_lines
  for each row execute function governance.set_updated_at();

alter table procurement.supplier_invoice_lines enable row level security;
create policy sil_read_auth on procurement.supplier_invoice_lines
  for select using (auth.role() = 'authenticated');

-- ─── 2.3  3-way match RPC ─────────────────────────────────────
create or replace function procurement.run_three_way_match(p_invoice_id bigint)
returns procurement.three_way_matches
language plpgsql
security definer
as $$
declare
  v_inv      procurement.supplier_invoices%rowtype;
  v_po_total numeric(18,2);
  v_po_qty   numeric(18,4);
  v_gr_qty   numeric(18,4);
  v_inv_qty  numeric(18,4);
  v_qty_var  numeric(18,4);
  v_price_var numeric(18,2);
  v_total_var numeric(18,2);
  v_pct      numeric(9,4);
  v_state    text;
  v_exceeded boolean;
  v_match    procurement.three_way_matches%rowtype;
begin
  select * into v_inv from procurement.supplier_invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice % not found', p_invoice_id; end if;
  if v_inv.po_id is null then raise exception 'Invoice % has no PO link — cannot 3-way match', p_invoice_id; end if;

  -- Totals from PO
  select coalesce(sum(line_total),0), coalesce(sum(quantity),0)
    into v_po_total, v_po_qty
    from procurement.purchase_order_lines where po_id = v_inv.po_id;

  -- Totals from GR (any GR linked to this PO that is accepted)
  select coalesce(sum(grl.quantity_accepted),0)
    into v_gr_qty
    from procurement.goods_receipt_lines grl
    join procurement.goods_receipts gr on gr.id = grl.goods_receipt_id
   where gr.po_id = v_inv.po_id and gr.state in ('accepted','closed');

  -- Totals from invoice
  select coalesce(sum(quantity),0)
    into v_inv_qty
    from procurement.supplier_invoice_lines where invoice_id = p_invoice_id;

  v_qty_var   := v_inv_qty - v_gr_qty;
  v_price_var := v_inv.subtotal - v_po_total;
  v_total_var := v_inv.grand_total - (v_po_total * 1.18);  -- includes VAT for full compare
  v_pct       := case when v_po_total = 0 then 0 else abs(v_price_var) / v_po_total end;
  v_exceeded  := v_pct > coalesce(v_inv.tolerance_pct, 0.02)
                 or abs(v_qty_var) > 0.001;
  v_state     := case when v_exceeded then 'discrepancy' else 'matched' end;

  insert into procurement.three_way_matches (
    match_number, po_id, goods_receipt_id, supplier_invoice_id,
    match_date, state,
    quantity_variance, price_variance, total_variance, variance_percent,
    tolerance_exceeded, requires_approval
  ) values (
    'TWM-' || to_char(now(),'YYYYMMDD') || '-' || nextval('procurement.three_way_matches_id_seq'),
    v_inv.po_id,
    (select id from procurement.goods_receipts where po_id = v_inv.po_id order by receipt_date desc limit 1),
    p_invoice_id,
    current_date, v_state,
    v_qty_var, v_price_var, v_total_var, v_pct,
    v_exceeded, v_exceeded
  ) returning * into v_match;

  -- Push state on the invoice
  update procurement.supplier_invoices
     set state = case when v_exceeded then 'discrepancy' else 'matched' end,
         matched_po = (not v_exceeded),
         three_way_match_id = v_match.id,
         updated_at = now()
   where id = p_invoice_id;

  return v_match;
end $$;

grant execute on function procurement.run_three_way_match(bigint) to authenticated;

-- ─── 2.4  GL posting trigger — fires on state → 'posted' ──────
create or replace function procurement.post_supplier_invoice_to_gl()
returns trigger
language plpgsql
as $$
declare
  v_txn_id bigint;
  v_ap_account     text := '21100';   -- Accounts Payable (liability)
  v_vat_account    text := '14210';   -- VAT receivable / input VAT
  v_default_exp    text := '60100';   -- Default expense
  v_line           record;
begin
  if NEW.state <> 'posted' or OLD.state = 'posted' then return NEW; end if;
  if NEW.gl_transaction_id is not null then return NEW; end if;  -- already posted

  -- One GL transaction header per invoice; lines below are debit/credit pairs
  insert into finance.gl_transactions (transaction_number, entry_date, account_code,
                                       debit_amount, credit_amount, currency,
                                       linked_entity_type, linked_entity_id, description)
  values ('AP-' || to_char(now(),'YYYYMMDD-HH24MISS') || '-' || NEW.id,
          NEW.invoice_date, v_ap_account,
          0, NEW.grand_total, coalesce(NEW.currency,'ILS'),
          'supplier_invoice', NEW.id,
          'AP invoice posting — Cr Accounts Payable')
  returning id into v_txn_id;

  -- Dr expense lines (one row per invoice line, by expense account)
  for v_line in
    select coalesce(expense_account_code, v_default_exp) as acct,
           sum(line_subtotal) as amt
      from procurement.supplier_invoice_lines
     where invoice_id = NEW.id
     group by 1
  loop
    insert into finance.gl_transactions (transaction_number, entry_date, account_code,
                                         debit_amount, credit_amount, currency,
                                         linked_entity_type, linked_entity_id, description)
    values ('AP-' || NEW.id || '-EXP-' || v_line.acct,
            NEW.invoice_date, v_line.acct,
            v_line.amt, 0, coalesce(NEW.currency,'ILS'),
            'supplier_invoice', NEW.id,
            'AP invoice expense — Dr ' || v_line.acct);
  end loop;

  -- Dr Input VAT
  if NEW.vat_total > 0 then
    insert into finance.gl_transactions (transaction_number, entry_date, account_code,
                                         debit_amount, credit_amount, currency,
                                         linked_entity_type, linked_entity_id, description)
    values ('AP-' || NEW.id || '-VAT', NEW.invoice_date, v_vat_account,
            NEW.vat_total, 0, coalesce(NEW.currency,'ILS'),
            'supplier_invoice', NEW.id,
            'AP invoice input VAT — Dr ' || v_vat_account);
  end if;

  NEW.gl_transaction_id := v_txn_id;
  NEW.posted_at         := now();
  return NEW;
end $$;

drop trigger if exists trg_si_post_to_gl on procurement.supplier_invoices;
create trigger trg_si_post_to_gl
  before update of state on procurement.supplier_invoices
  for each row execute function procurement.post_supplier_invoice_to_gl();

commit;
```

---

## 3. Route code — append to `onyx-procurement/server.js` after line ~1389

The block follows the same pattern as the existing PO routes (RBAC + enforceTransition + recordTransition + audit + emitDomainEvent + sendErpNotification):

```js
// ═══════════════════════════════════════════════════════════════
// API: AP INVOICES — חשבוניות ספק (AGENT-207)
// ═══════════════════════════════════════════════════════════════

// POST /api/invoices  body: { direction:'input', supplier_id, supplier_invoice_number,
//                             po_id?, invoice_date, due_date, currency, lines:[{...}] }
app.post('/api/invoices', writeLimiter, requirePermission('invoices:create'), async (req, res) => {
  const b = req.body || {};
  if (b.direction && b.direction !== 'input') {
    return res.status(400).json({ error: 'This endpoint creates AP (input) invoices only' });
  }
  if (!b.supplier_id || !b.supplier_invoice_number || !Array.isArray(b.lines) || !b.lines.length) {
    return res.status(400).json({ error: 'supplier_id, supplier_invoice_number, lines[] are required' });
  }

  // Subtotals
  const subtotal  = b.lines.reduce((s, l) => s + Number(l.line_subtotal || 0), 0);
  const vat_total = b.lines.reduce((s, l) => s + Number(l.vat_amount    || 0), 0);
  const grand     = subtotal + vat_total;

  const { data: header, error: e1 } = await supabase
    .from('supplier_invoices')   // procurement schema exposed via PostgREST
    .insert({
      supplier_invoice_number: b.supplier_invoice_number,
      supplier_id: b.supplier_id, po_id: b.po_id || null,
      invoice_date: b.invoice_date, due_date: b.due_date,
      subtotal, vat_total, grand_total: grand,
      currency: b.currency || 'ILS',
      fx_rate: b.fx_rate || 1,
      grand_total_ils: grand * (b.fx_rate || 1),
      project_id: b.project_id || null,
      pdf_url: b.pdf_url || null, ocr_raw: b.ocr_raw || null,
      tolerance_pct: b.tolerance_pct ?? 0.02,
      state: 'draft',
    })
    .select().single();
  if (e1) return res.status(400).json({ error: e1.message });

  const linesPayload = b.lines.map((l, i) => ({
    invoice_id: header.id,
    line_number: i + 1,
    po_line_id: l.po_line_id || null,
    goods_receipt_line_id: l.goods_receipt_line_id || null,
    description: l.description, quantity: l.quantity,
    unit_of_measure: l.unit_of_measure || null,
    unit_price: l.unit_price,
    line_subtotal: l.line_subtotal,
    vat_percent: l.vat_percent ?? 18,
    vat_amount: l.vat_amount ?? 0,
    line_total: l.line_total,
    expense_account_code: l.expense_account_code || null,
    project_id: l.project_id || null,
    cost_center_code: l.cost_center_code || null,
  }));
  const { error: e2 } = await supabase.from('supplier_invoice_lines').insert(linesPayload);
  if (e2) return res.status(400).json({ error: e2.message });

  await audit('supplier_invoice', header.id, 'created', req.actor || 'api',
    `AP invoice ${header.supplier_invoice_number} — ${b.lines.length} lines, ₪${grand}`,
    null, header);

  emitDomainEvent('procurement.supplier_invoice.created', {
    entityType: 'SupplierInvoice', entityId: header.id, action: 'created',
    actor: req.actor || 'system',
    payload: { invoiceId: header.id, supplierId: b.supplier_id, poId: b.po_id, total: grand },
  }).catch(() => {});

  res.status(201).json({ invoice: header, lines_count: b.lines.length });
});

// POST /api/invoices/:id/match — run 3-way match (PO ↔ GR ↔ Invoice)
app.post('/api/invoices/:id/match', writeLimiter, requirePermission('invoices:approve'), async (req, res) => {
  const id = Number(req.params.id);
  const { data: cur } = await supabase.from('supplier_invoices').select('id, state, po_id').eq('id', id).single();
  if (!cur) return res.status(404).json({ error: 'Invoice not found' });

  // Allow match from draft or pending_3way_match
  if (!['draft', 'pending_3way_match', 'discrepancy'].includes(cur.state)) {
    return res.status(409).json({ error: `Cannot match invoice in state '${cur.state}'`, code: 'INVALID_TRANSITION' });
  }

  const { data: matchResult, error } = await supabase.rpc('run_three_way_match', { p_invoice_id: id });
  if (error) return res.status(400).json({ error: error.message });

  await audit('supplier_invoice', id, 'matched', req.actor || 'api',
    `3-way match ${matchResult.state} — variance ${matchResult.variance_percent}%`,
    cur, matchResult);

  emitDomainEvent('procurement.supplier_invoice.matched', {
    entityType: 'SupplierInvoice', entityId: id, action: 'matched',
    actor: req.actor || 'system',
    payload: { invoiceId: id, matchId: matchResult.id, state: matchResult.state,
               toleranceExceeded: matchResult.tolerance_exceeded },
  }).catch(() => {});

  res.json({ match: matchResult });
});

// POST /api/invoices/:id/post — transition to 'posted' → fires GL trigger
app.post('/api/invoices/:id/post', writeLimiter, requirePermission('invoices:approve'), async (req, res) => {
  const id = Number(req.params.id);
  const { data: cur } = await supabase.from('supplier_invoices').select('*').eq('id', id).single();
  if (!cur) return res.status(404).json({ error: 'Invoice not found' });

  if (!['matched', 'approved_for_payment'].includes(cur.state)) {
    return res.status(409).json({
      error: `Cannot post invoice in state '${cur.state}' — must be matched or approved_for_payment`,
      code: 'INVALID_TRANSITION',
    });
  }

  const { data: updated, error } = await supabase.from('supplier_invoices')
    .update({ state: 'posted', posted_by_user_id: req.body.posted_by_user_id || null })
    .eq('id', id).select().single();
  if (error) return res.status(400).json({ error: error.message });

  await recordTransition(supabase, {
    entityType: 'supplier_invoice', entityId: id,
    from: cur.state, to: 'posted',
    actor: req.actor || 'system', reason: req.body.reason || 'AP invoice posted',
  });
  await audit('supplier_invoice', id, 'posted', req.actor || 'api',
    `AP invoice posted to GL (txn ${updated.gl_transaction_id})`, cur, updated);

  emitDomainEvent('finance.gl.posted', {
    entityType: 'SupplierInvoice', entityId: id, action: 'posted',
    actor: req.actor || 'system',
    payload: { invoiceId: id, glTransactionId: updated.gl_transaction_id, total: updated.grand_total },
  }).catch(() => {});

  sendErpNotification({
    type: 'finance', priority: 'high',
    title: 'חשבונית ספק נרשמה ב-GL',
    message: `חשבונית #${updated.supplier_invoice_number} נרשמה — ₪${updated.grand_total}`,
  });

  res.json({ invoice: updated, message: 'AP invoice posted to GL' });
});

app.get('/api/invoices', async (req, res) => {
  const { data } = await supabase.from('supplier_invoices')
    .select('*, supplier_invoice_lines(*)')
    .order('created_at', { ascending: false }).limit(100);
  res.json({ invoices: data });
});

app.get('/api/invoices/:id', async (req, res) => {
  const { data } = await supabase.from('supplier_invoices')
    .select('*, supplier_invoice_lines(*), three_way_matches(*)')
    .eq('id', req.params.id).single();
  if (!data) return res.status(404).json({ error: 'Invoice not found' });
  res.json({ invoice: data });
});
```

---

## 4. State machine entry — add to `src/pipeline/state-machines.js`

```js
supplier_invoice: {
  initial: 'draft',
  states: ['draft','pending_3way_match','matched','discrepancy',
           'approved_for_payment','posted','paid','cancelled','on_hold','reversed'],
  transitions: [
    { from:'draft',                   to:'pending_3way_match',   action:'submit_for_match' },
    { from:'pending_3way_match',      to:'matched',              action:'match_pass',
      triggers:[{action:'create_three_way_match'}] },
    { from:'pending_3way_match',      to:'discrepancy',          action:'match_fail' },
    { from:'discrepancy',             to:'matched',              action:'override_match',  requires:'invoices:override' },
    { from:'matched',                 to:'approved_for_payment', action:'approve_payment' },
    { from:'matched',                 to:'posted',               action:'post',
      triggers:[{action:'post_to_gl'}] },
    { from:'approved_for_payment',    to:'posted',               action:'post',
      triggers:[{action:'post_to_gl'}] },
    { from:'posted',                  to:'paid',                 action:'mark_paid' },
    { from:'posted',                  to:'reversed',             action:'reverse',         requires:'invoices:reverse' },
    { from:'draft',                   to:'cancelled',            action:'cancel' },
    { from:'pending_3way_match',      to:'on_hold',              action:'hold' },
    { from:'on_hold',                 to:'pending_3way_match',   action:'release' },
  ],
},
```

---

## 5. Files to touch (summary)

| File | Action | Lines |
|---|---|---|
| `supabase/migrations/00072_ap_invoices_and_three_way_match.sql` | NEW | ~140 SQL |
| `onyx-procurement/server.js` | INSERT after line 1389 | ~140 JS |
| `onyx-procurement/src/pipeline/state-machines.js` | INSERT block | ~25 JS |
| `onyx-procurement/src/auth/rbac.js` | ADD perms `invoices:create`, `invoices:approve`, `invoices:override`, `invoices:reverse` | ~4 |

---

## 6. Smoke tests (drop into `onyx-procurement/test/api/qa-22-ap-invoices.test.js`)

1. POST `/api/invoices` with valid PO ref + 2 lines → 201, header.state='draft', 2 line rows.
2. POST `/api/invoices/:id/match` against PO with matching GR → match.state='matched', invoice.state='matched'.
3. Inject 5% qty variance → `tolerance_exceeded=true`, invoice.state='discrepancy'.
4. POST `/api/invoices/:id/post` → invoice.state='posted', `gl_transaction_id` populated, 3 rows in `finance.gl_transactions` (Cr AP + Dr Expense + Dr VAT) summing to zero.
5. POST `/api/invoices/:id/post` while state='draft' → 409 INVALID_TRANSITION.
6. Duplicate `(supplier_id, supplier_invoice_number)` → 23505 unique violation.
7. POST without RBAC perm → 403.

---

## 7. Out of scope (defer to AGENT-208/209)

- AP payment runs (`payment-run.js` wiring) — that engine exists at 1120 LOC; separate task.
- Withholding tax (ניכוי במקור) at posting time — Israeli compliance gap, separate.
- OCR pipeline (`POST /api/invoices/:id/ocr`) — `ocr_raw` column ready, no parser wired.
- Foreign-currency revaluation cron — `fx_rate`, `grand_total_ils` populated, no period-end job.
- Multi-tier approval routing via `procurement.approval_steps` — table exists, escalation absent.

---

## 8. Why this works

1. **Reuses existing tables** — does not collide with `finance.invoices` (AR) or duplicate `db/migrations/0004` (unloaded). Strengthens `procurement.supplier_invoices` which already had FKs from `three_way_matches`.
2. **Match logic in DB, not app** — `run_three_way_match()` RPC is one round-trip; idempotent for retry; transactional with the state update.
3. **GL posting via trigger, not endpoint** — once state goes to `posted`, the trigger always fires; no path to "forget" to post. Reverses cleanly via `state='reversed'`.
4. **Same observability hooks as PO routes** — `enforceTransition` / `recordTransition` / `audit` / `emitDomainEvent` / `sendErpNotification` — debugger and Finance360 see it the same way as customer invoices.
5. **AGENT-160 verdict moves** from PARTIAL → IMPLEMENTED for AP Invoice + 3-way match. Payment disbursement (§6) still missing — separate ticket.
