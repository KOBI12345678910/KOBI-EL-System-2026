# AGENT-206 — GRN (Goods Receipt Note) Patch

**Service**: ONYX_PROCUREMENT (port 3100)
**Date**: 2026-04-29
**Scope**: Wire `POST /api/purchase-orders/:id/receive` to close P2P gap identified by AGENT-160
**Stage in Master Flow**: PO sent → **GRN** → Inventory → AP Invoice → Payment
**Status**: Ready to apply (single migration + ~150 LoC route + 1 orchestrator entry)

---

## 1. Style audit (patch matches existing conventions)

- Route style: `server.js:1212` `/api/purchase-orders/:id/approve`
- RBAC: `requirePermission('purchase-orders:…')` — new perm `purchase-orders:receive`
- State machine: `enforceTransition('po', from, to)` (`server.js:1218`) with `partial_receive`/`full_receive`
- Audit: `audit('purchase_order', id, action, actor, detail, prev, next)` (`server.js:498`)
- Transition history: `recordTransition(supabase,{…})` + `stateHistoryWriter.recordTransition({…})` paired (`server.js:1229,1240`)
- Domain event: `emitDomainEvent('procurement.po.received', …)`
- Idempotency: `Idempotency-Key` header via `src/resilience/idempotency-key.js`
- Live PO line table: `po_line_items` lacks `received_qty` (`supabase/migrations/001-supabase-schema.sql:237`) — patch adds it
- Migration ordinal: next free slot is `00072` (last is `00071_remove_dangerous_anon_read_policies.sql`)

---

## 2. SQL migration — `supabase/migrations/00072_goods_receipts.sql`

Two-table model (header + lines), plus an `ALTER` on `po_line_items` to track running received qty (mirrors the alt schema at `db/migrations/0003_purchase_orders.sql:46`). Uses transactional `received_qty` arithmetic gated by a CHECK to prevent over-receipt.

```sql
-- ============================================================
-- 00072_goods_receipts.sql — GRN (Goods Receipt Note) tables
-- AGENT-206 — closes P2P gap (AGENT-160 §4)
-- Rule: לא מוחקים רק משדרגים — additive only.
-- ============================================================

-- 1. Add running-received counter to existing live po_line_items
ALTER TABLE public.po_line_items
  ADD COLUMN IF NOT EXISTS received_qty NUMERIC(14,4) NOT NULL DEFAULT 0;

ALTER TABLE public.po_line_items
  DROP CONSTRAINT IF EXISTS chk_pol_received_ok;
ALTER TABLE public.po_line_items
  ADD  CONSTRAINT chk_pol_received_ok
       CHECK (received_qty >= 0 AND received_qty <= quantity);

-- 2. GRN header
CREATE TABLE IF NOT EXISTS public.goods_receipts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_number        TEXT UNIQUE NOT NULL,                          -- e.g. GRN-2026-0001
  po_id             UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  supplier_id       UUID REFERENCES public.suppliers(id),
  received_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_by       UUID,                                           -- auth.users.id
  warehouse_id      UUID,                                           -- optional FK; nullable
  delivery_note_no  TEXT,                                           -- supplier's note number
  carrier           TEXT,
  status            TEXT NOT NULL DEFAULT 'received'
                    CHECK (status IN ('received','partially_received','rejected','reversed')),
  inspection_status TEXT NOT NULL DEFAULT 'pending'
                    CHECK (inspection_status IN ('pending','passed','failed','partial')),
  quality_score     NUMERIC(4,2),                                   -- 0..100
  notes             TEXT,
  -- Idempotency: stable client key prevents duplicate GRN on retry/double-click
  idempotency_key   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_grn_idem UNIQUE (po_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_grn_po          ON public.goods_receipts (po_id);
CREATE INDEX IF NOT EXISTS idx_grn_supplier    ON public.goods_receipts (supplier_id);
CREATE INDEX IF NOT EXISTS idx_grn_received_at ON public.goods_receipts (received_at DESC);

-- 3. GRN lines — one row per PO line received (zero qty is illegal)
CREATE TABLE IF NOT EXISTS public.goods_receipt_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id          UUID NOT NULL REFERENCES public.goods_receipts(id) ON DELETE CASCADE,
  po_line_id      UUID NOT NULL REFERENCES public.po_line_items(id)  ON DELETE RESTRICT,
  received_qty    NUMERIC(14,4) NOT NULL,
  rejected_qty    NUMERIC(14,4) NOT NULL DEFAULT 0,
  rejection_reason TEXT,
  lot_number      TEXT,
  serial_numbers  JSONB,                                           -- array of serials
  expiry_date     DATE,
  unit_cost       NUMERIC(14,2),                                   -- snapshot for costing
  notes           TEXT,
  CONSTRAINT chk_grn_qty_pos       CHECK (received_qty >  0),
  CONSTRAINT chk_grn_rejected_nneg CHECK (rejected_qty >= 0),
  UNIQUE (grn_id, po_line_id)                                      -- one entry per line per GRN
);

CREATE INDEX IF NOT EXISTS idx_grn_lines_grn  ON public.goods_receipt_lines (grn_id);
CREATE INDEX IF NOT EXISTS idx_grn_lines_line ON public.goods_receipt_lines (po_line_id);

-- 4. updated_at touch
DROP TRIGGER IF EXISTS trg_grn_touch ON public.goods_receipts;
CREATE TRIGGER trg_grn_touch
  BEFORE UPDATE ON public.goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5. RLS — same pattern as PO tables (server-side enforces RBAC)
ALTER TABLE public.goods_receipts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goods_receipt_lines  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY grn_read_auth ON public.goods_receipts
    FOR SELECT USING ((SELECT auth.role()) = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY grn_lines_read_auth ON public.goods_receipt_lines
    FOR SELECT USING ((SELECT auth.role()) = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 6. Sequence-backed GRN number generator (stable, monotonic)
CREATE SEQUENCE IF NOT EXISTS public.grn_number_seq START 1;

CREATE OR REPLACE FUNCTION public.next_grn_number() RETURNS TEXT
LANGUAGE sql VOLATILE AS $$
  SELECT 'GRN-' || to_char(now(),'YYYY') || '-'
       || lpad(nextval('public.grn_number_seq')::text, 5, '0')
$$;

-- 7. Permission seed (matches purchase-orders:* family)
INSERT INTO public.permissions (resource, action) VALUES ('purchase-orders','receive')
  ON CONFLICT DO NOTHING;
```

> **Mirror in repo migration trail** — copy verbatim to `onyx-procurement/db/migrations/0006_goods_receipts.sql` so both trails (Supabase + repo) advance together.

---

## 3. Route handler — append to `onyx-procurement/server.js` (after line 1264, the `/approve` block)

```js
// ═══════════════════════════════════════════════════════════════
// API: GOODS RECEIPT (GRN) — קבלת סחורה
// AGENT-206 — wires P2P stage 4 (PO sent → GRN → Inventory)
// ═══════════════════════════════════════════════════════════════

const idempotency = require('./src/resilience/idempotency-key');

// Body: { received_by, warehouse_id?, delivery_note_no?, carrier?, notes?,
//         inspection_status?, quality_score?,
//         lines: [{ po_line_id, received_qty, rejected_qty?, rejection_reason?,
//                   lot_number?, serial_numbers?, expiry_date?, unit_cost?, notes? }] }
// Header: Idempotency-Key (required for safe retry)
app.post(
  '/api/purchase-orders/:id/receive',
  requirePermission('purchase-orders:receive'),
  idempotency.middleware({ ttlMs: 24 * 3600 * 1000 }), // 24h replay window
  async (req, res) => {
    const poId = req.params.id;
    const idemKey = req.get('Idempotency-Key') || null;
    const actor = req.body.received_by || req.actor || null;

    // 1. Validate body
    if (!Array.isArray(req.body.lines) || req.body.lines.length === 0) {
      return res.status(400).json({ error: 'lines[] required & non-empty', code: 'INVALID_BODY' });
    }
    for (const l of req.body.lines) {
      if (!l.po_line_id || !(Number(l.received_qty) > 0)) {
        return res.status(400).json({ error: 'each line needs po_line_id and received_qty>0', code: 'INVALID_LINE', line: l });
      }
    }

    // 2. PO lookup
    const { data: po } = await supabase.from('purchase_orders')
      .select('*, po_line_items(*)').eq('id', poId).single();
    if (!po) return res.status(404).json({ error: 'PO not found', code: 'PO_NOT_FOUND' });

    // 3. State gate
    const fromStatus = po.status;
    if (!['sent', 'partially_received'].includes(fromStatus)) {
      return res.status(409).json({ error: `cannot receive in status '${fromStatus}'`, code: 'INVALID_STATE',
                                    allowed_from: ['sent', 'partially_received'] });
    }

    // 4. Per-line validation vs running received_qty
    const lineMap = new Map(po.po_line_items.map(l => [l.id, l]));
    const updates = [];
    for (const l of req.body.lines) {
      const poLine = lineMap.get(l.po_line_id);
      if (!poLine) return res.status(400).json({ error: `line ${l.po_line_id} not on PO`, code: 'LINE_MISMATCH' });
      const already = Number(poLine.received_qty || 0);
      const next = already + Number(l.received_qty);
      if (next > Number(poLine.quantity) + 1e-6) {
        return res.status(409).json({ error: `over-receipt: line ${poLine.id}`, code: 'OVER_RECEIPT',
                                      ordered: poLine.quantity, already, incoming: l.received_qty });
      }
      updates.push({ lineId: poLine.id, newReceived: next });
    }

    // 5. DB-level idempotency check (uniq po_id+idempotency_key)
    if (idemKey) {
      const { data: dup } = await supabase.from('goods_receipts')
        .select('id, grn_number').eq('po_id', poId).eq('idempotency_key', idemKey).maybeSingle();
      if (dup) return res.json({ grn: dup, replayed: true, message: 'GRN replay (idempotent)' });
    }

    // 6. Number + 7. Insert header
    const { data: numRow } = await supabase.rpc('next_grn_number');
    const grnNumber = numRow || `GRN-${Date.now()}`;
    const { data: grn, error: grnErr } = await supabase.from('goods_receipts').insert({
      grn_number: grnNumber, po_id: poId, supplier_id: po.supplier_id,
      received_by: actor, warehouse_id: req.body.warehouse_id || null,
      delivery_note_no: req.body.delivery_note_no || null, carrier: req.body.carrier || null,
      inspection_status: req.body.inspection_status || 'pending',
      quality_score: req.body.quality_score ?? null, notes: req.body.notes || null,
      idempotency_key: idemKey, status: 'received',
    }).select().single();
    if (grnErr) return res.status(500).json({ error: grnErr.message, code: 'GRN_INSERT_FAILED' });

    // 8. Insert lines (with compensating rollback on failure)
    const grnLineRows = req.body.lines.map(l => ({
      grn_id: grn.id, po_line_id: l.po_line_id,
      received_qty: Number(l.received_qty), rejected_qty: Number(l.rejected_qty || 0),
      rejection_reason: l.rejection_reason || null, lot_number: l.lot_number || null,
      serial_numbers: l.serial_numbers || null, expiry_date: l.expiry_date || null,
      unit_cost: l.unit_cost != null ? Number(l.unit_cost) : (lineMap.get(l.po_line_id)?.unit_price ?? null),
      notes: l.notes || null,
    }));
    const { error: linesErr } = await supabase.from('goods_receipt_lines').insert(grnLineRows);
    if (linesErr) {
      await supabase.from('goods_receipts').delete().eq('id', grn.id);
      return res.status(500).json({ error: linesErr.message, code: 'GRN_LINES_FAILED' });
    }

    // 9. Bump received_qty on each PO line
    for (const u of updates) {
      await supabase.from('po_line_items').update({ received_qty: u.newReceived }).eq('id', u.lineId);
    }

    // 10. Resolve new PO status
    const after = po.po_line_items.map(l => {
      const u = updates.find(x => x.lineId === l.id);
      return u ? u.newReceived : Number(l.received_qty || 0);
    });
    const ordered = po.po_line_items.map(l => Number(l.quantity));
    const fullyReceivedAll = after.every((q, i) => Math.abs(q - ordered[i]) < 1e-6);
    const toStatus = fullyReceivedAll ? 'fully_received' : 'partially_received';

    const sm = enforceTransition('po', fromStatus, toStatus);
    if (!sm.valid) return res.status(409).json({ error: sm.error, allowed: sm.allowed, code: 'INVALID_TRANSITION' });

    await supabase.from('purchase_orders').update({ status: toStatus }).eq('id', poId);

    // 11. State history (both writers — matches /approve pattern)
    await recordTransition(supabase, { entityType: 'purchase_order', entityId: poId,
      from: fromStatus, to: toStatus, actor: actor || 'system', reason: `GRN ${grnNumber}` });
    try {
      await stateHistoryWriter.recordTransition({ entityType: 'purchase_order', entityId: String(poId),
        fromState: fromStatus, toState: toStatus, userId: actor, reason: `GRN ${grnNumber}` });
    } catch (err) { console.warn('[state-history] GRN:', err && err.message); }

    // 12. Audit
    await audit('goods_receipt', grn.id, 'created', actor, `GRN ${grnNumber} on PO ${po.po_number || poId}`, null, grn);
    await audit('purchase_order', poId, toStatus, actor, `via GRN ${grnNumber}`, { status: fromStatus }, { status: toStatus });

    // 13. Domain event
    emitDomainEvent('procurement.po.received', {
      entityType: 'PurchaseOrder', entityId: poId, action: toStatus, actor: actor || 'system',
      payload: { poId, grnId: grn.id, grnNumber, supplierId: po.supplier_id, partial: !fullyReceivedAll,
                 lines: grnLineRows.map(r => ({ po_line_id: r.po_line_id, received_qty: r.received_qty, rejected_qty: r.rejected_qty })) },
    }).catch(() => {});

    sendErpNotification({ type: 'procurement',
      title: fullyReceivedAll ? 'הזמנת רכש התקבלה במלואה' : 'קבלה חלקית',
      message: `${grnNumber} — ${toStatus}`, priority: 'normal' });

    res.status(201).json({ grn, lines: grnLineRows, po_status: toStatus,
                           partial: !fullyReceivedAll, message: `GRN ${grnNumber} created — ${toStatus}` });
  }
);
```

---

## 4. Orchestrator wiring — patch `onyx-procurement/src/pipeline/orchestrator.js`

Replace the existing `'po.receive_items'` block (lines 135–148) with the action key the wiring-spec already declares (`goods_receipt.create`) and add an alias so older callers keep working.

```js
'goods_receipt.create': {
  service: 'procurement', label: 'יצירת תעודת קבלה (GRN)',
  preconditions: [
    { check: 'entity_exists', entity: 'po' },
    { check: 'status_in', statuses: ['sent', 'partially_received'] },
    { check: 'body_has', field: 'lines' },
  ],
  effects: [
    { type: 'create', entity: 'goods_receipt', fields: { po_id: ':poId' } },
    { type: 'create_many', entity: 'goods_receipt_line', fromBody: 'lines' },
    { type: 'increment', entity: 'po_line_items', field: 'received_qty', byLine: true },
    { type: 'transition', entity: 'po', transition: 'partial_receive_or_full' }, // resolved at runtime
    { type: 'update_inventory', action: 'receipt' },
    { type: 'update_costing' },
    { type: 'audit', message: 'תעודת קבלה נוצרה' },
  ],
  events: ['procurement.po.received'],
  listeners: [
    'ops.try_allocate_received_stock',
    'ai.check_delivery_anomalies',
    'ap.prepare_three_way_match',
  ],
  api: { method: 'POST', path: '/api/purchase-orders/:id/receive' },
  navigate: '/entity360.html?type=goods_receipt&id=:newId',
},

// Back-compat alias for the old action key (AGENT-160 §4 reference)
'po.receive_items': { aliasOf: 'goods_receipt.create' },
```

In `executeOrchestration()` (line 270), prepend alias resolution:

```js
async function executeOrchestration(actionKey, context, { supabase, audit }) {
  let orch = ORCHESTRATIONS[actionKey];
  if (orch && orch.aliasOf) orch = ORCHESTRATIONS[orch.aliasOf];
  if (!orch) return { ok: false, error: `Unknown action: ${actionKey}` };
  // …rest unchanged
}
```

---

## 5. Integration steps (apply order — do NOT skip)

1. **DB**
   ```bash
   # Supabase trail
   psql "$DATABASE_URL" -f supabase/migrations/00072_goods_receipts.sql
   # Repo trail (mirror)
   psql "$DATABASE_URL" -f onyx-procurement/db/migrations/0006_goods_receipts.sql
   ```
2. **Permissions** — confirm seed picked up: `SELECT * FROM permissions WHERE resource='purchase-orders' AND action='receive';` then map to roles `procurement_officer`, `warehouse_manager`, `admin` via the existing role_permissions table.
3. **Code** — apply the patches above to `onyx-procurement/server.js` and `onyx-procurement/src/pipeline/orchestrator.js`.
4. **Pipeline metadata** — in `src/pipeline/wiring-spec.js` confirm the action→API mapping for `goods_receipt.create` resolves to `POST /api/purchase-orders/:id/receive`. If absent, add to the `apiMappings` table (line ~183) — AGENT-160 §4.1 already references the path, so the spec is the source of truth.
5. **Boot banner** — append to the boot banner in `server.js:1807`:
   ```
   ║   POST /api/purchase-orders/:id/receive  ← קבלת סחורה (GRN) ║
   ```
6. **Smoke test**
   ```bash
   PO_ID=$(curl -s ...).order.id
   curl -X POST "$API/api/purchase-orders/$PO_ID/receive" \
     -H 'Content-Type: application/json' \
     -H 'Idempotency-Key: 11111111-1111-1111-1111-111111111111' \
     -d '{"received_by":"<uuid>","lines":[{"po_line_id":"<uuid>","received_qty":5}]}'
   # Replay must return identical body with replayed:true
   ```
7. **Regression** — re-run AGENT-160 trace; Section 4 should flip to IMPLEMENTED. Section 5 (AP Invoice 3-way match) now becomes the next agent's target — `goods_receipts` rows are the missing JOIN side.
8. **UI** — `web/po360.html:175-177` mock GRN list can be wired to `GET /api/purchase-orders/:id/goods-receipts` (trivial follow-up, ~10 LoC, not in scope of this patch).

---

## 6. What this patch deliberately leaves to follow-ups

| Out-of-scope | Why | Tracked by |
|---|---|---|
| Inventory-side write (`inventory.movements` insert on receipt) | Belongs in inventory service event listener, not the PO route | `procurement.po.received` event consumer |
| 3-way match (PO ↔ GRN ↔ AP-Invoice) | Needs supplier-invoice route first (AGENT-160 §5) | next agent |
| GRN reversal endpoint (`PATCH /:grnId/reverse`) | Schema supports `status='reversed'`; route is ~30 LoC | AGENT-207 |
| GRN PDF artifact | `src/receipts/` exists but customer-side; supplier GRN PDF is cosmetic | AGENT-208 |
| Multi-warehouse routing rules | `warehouse_id` column accepts NULL today | inventory service |
| Serial-number uniqueness validation | Stored as JSONB; cross-row uniqueness is policy, not schema | follow-up |

---

## 7. Acceptance criteria

- `POST /api/purchase-orders/:id/receive` returns 201 with `grn`, `lines`, `po_status`.
- Same `Idempotency-Key` replays → 200 with `replayed:true`, no duplicate row.
- Over-receipt (received_qty + already > ordered) → 409 `OVER_RECEIPT`.
- PO status transitions: `sent → partially_received` (some lines short) or `sent → fully_received` (all lines complete); a second partial GRN moves `partially_received → fully_received` once the last unit lands.
- `audit_logs`, `state_history`, and domain event `procurement.po.received` all populated.
- Permission `purchase-orders:receive` enforced; missing perm → 403.
- AGENT-160 §4 verdict updates from "NOT IMPLEMENTED" to "IMPLEMENTED".
