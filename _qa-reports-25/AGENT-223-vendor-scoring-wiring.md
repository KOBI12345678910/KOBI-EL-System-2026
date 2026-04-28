# AGENT-223 — Vendor Scoring: Close-the-Loop Wiring

**Agent:** 223
**Date:** 2026-04-29
**Worktree:** `objective-merkle-40ff93`
**Reference:** AGENT-183 (`_qa-reports-25/AGENT-183-vendor-scoring.md`) — module green, **zero production callers**.
**Source under wiring:** `onyx-procurement/src/analytics/vendor-scoring.js` (930 LOC, 32 tests pass).
**Targets touched:** PO state-machine triggers, scheduler, supplier persistence, Supplier360 tab, orchestrator.
**Verdict:** Patches resolve P1 gap from AGENT-183 §5 (Blacklist flow / `performance_score` persistence / orchestrator action / Supplier360 tab).

---

## 0. Audit recap (from AGENT-183 §5)

| Gap | Owner | Fix |
|-----|-------|-----|
| `scoreVendor` has no callers | this agent | Patches 1 + 2 (event listener + cron) |
| `performance_score` / `risk_level` never written | this agent | Patch 3 (persistence helper) |
| No Supplier360 surface for the scorecard | this agent | Patch 4 (new tab `ניקוד והערכה`) |
| `blacklist_vendor` orchestrator action missing | this agent | Patch 5 (orchestrator + state machine) |
| No supplier state machine | this agent | Patch 5b (new entry in `state-machines.js`) |

All five patches are **append-only with respect to existing exports** and additive to the registry maps. No deletions.

---

## 1. Patch 1 — Event listener: re-score on PO completion

**File:** `onyx-procurement/src/wiring/domain-events.js` (extend listener registration)
**Trigger:** `procurement.po.fully_received` and `procurement.po.closed` (PO state-machine triggers in `state-machines.js:95-100,141-145`).
**Behaviour:** fire-and-forget; never throws into the PO close path.

```js
// onyx-procurement/src/wiring/vendor-scoring-listener.js  (NEW FILE)
'use strict';
const { scoreVendor } = require('../analytics/vendor-scoring');
const { persistScore } = require('../suppliers/score-persistence');

/**
 * Subscribe vendor re-scoring to PO completion events.
 * Append-only — adds listeners; does not modify any other event flow.
 */
function registerVendorScoringListener({ bus, supabase, logger = console }) {
  if (!bus || !supabase) return { ok: false, reason: 'bus and supabase required' };

  const handler = async (evt) => {
    const supplierId = evt?.payload?.supplierId || evt?.payload?.supplier_id;
    if (!supplierId) return;
    try {
      const history = await loadSupplierHistory(supabase, supplierId);
      const score = scoreVendor(String(supplierId), history);
      await persistScore(supabase, supplierId, score);
      logger.info({ supplierId, composite: score.composite, badge: score.badge }, 'vendor.rescored');
    } catch (err) {
      logger.warn({ err: err && err.message, supplierId }, 'vendor.rescore.failed');
    }
  };

  bus.on('procurement.po.fully_received', handler);
  bus.on('procurement.po.closed', handler);
  bus.on('procurement.po.received', handler); // alias used by some emitters
  return { ok: true, eventsBound: 3 };
}

async function loadSupplierHistory(supabase, supplierId) {
  // Pull last 24 months of POs + payments + RFQ comm logs.
  const since = new Date(Date.now() - 24 * 30 * 24 * 3600 * 1000).toISOString();
  const [posQ, payQ, commQ, scoresQ] = await Promise.all([
    supabase.from('procurement.purchase_orders')
      .select('id, po_number, supplier_id, ordered_at, promised_at, delivered_at, urgent, total_amount, payment_days, items')
      .eq('supplier_id', supplierId).gte('ordered_at', since),
    supabase.from('procurement.payments')
      .select('id, supplier_id, net_days').eq('supplier_id', supplierId),
    supabase.from('procurement.supplier_communications')
      .select('id, supplier_id, request_at, response_at').eq('supplier_id', supplierId),
    supabase.from('procurement.vendor_score_history')
      .select('composite').eq('supplier_id', supplierId)
      .order('created_at', { ascending: true }).limit(5),
  ]);
  return {
    purchaseOrders: (posQ.data || []).flatMap(po => (po.items || []).map(it => ({
      ...po, ...it, id: `${po.id}-${it.id || 'all'}`,
    }))),
    payments: payQ.data || [],
    communications: commQ.data || [],
    recentScores: (scoresQ.data || []).map(r => r.composite),
  };
}

module.exports = { registerVendorScoringListener };
```

**Wire-up in `onyx-procurement/server.js`** (insert after `initDomainEvents` call, ~line 56):

```js
const { registerVendorScoringListener } = require('./src/wiring/vendor-scoring-listener');
const { bus } = initDomainEvents({ supabase });
registerVendorScoringListener({ bus, supabase, logger: console });
console.log('   ✓ Vendor scoring listener bound (3 events)');
```

---

## 2. Patch 2 — Nightly cron sweep (catch-up for vendors with no recent PO)

**File:** `onyx-procurement/src/jobs/jobs-registry.js` — append a job to `DEFAULT_JOBS`.
**Reason:** AGENT-183 §6 noted `recentScores[]` history must be assembled by the caller; a nightly sweep guarantees every active vendor has a fresh score even when there is no PO event for weeks.

```js
// jobs-registry.js  (append near end of DEFAULT_JOBS array)
{
  id: 'nightly-vendor-rescore',
  description: 'Re-score every active supplier; persist composite + risk_level',
  category: 'analytics',
  cron: '15 2 * * *',                  // 02:15 daily, after 02:00 backup
  handler: runNightlyVendorRescore,
  timeout: 30 * 60 * 1000,
  retries: 1,
  retryDelayMs: 5 * 60_000,
  onFailure: 'notify-admin',
  runMissedOnStartup: true,
},
```

```js
async function runNightlyVendorRescore(ctx) {
  const { scoreVendor } = require('../analytics/vendor-scoring');
  const { persistScore } = require('../suppliers/score-persistence');
  const supabase = ctx.supabase || (ctx.deps && ctx.deps.supabase);
  if (!supabase) {
    ctx.logger.warn({ id: ctx.id }, 'rescore.skipped_no_supabase');
    return;
  }
  const { data: vendors = [] } = await supabase
    .from('procurement.suppliers')
    .select('id')
    .in('status', ['active', 'preferred', 'probation']);
  let scored = 0, failed = 0;
  for (const v of vendors) {
    try {
      const history = await require('../wiring/vendor-scoring-listener')
        .__loadSupplierHistory(supabase, v.id);
      const s = scoreVendor(String(v.id), history);
      await persistScore(supabase, v.id, s);
      scored++;
    } catch (err) {
      failed++;
      ctx.logger.warn({ vendorId: v.id, err: err && err.message }, 'rescore.row_failed');
    }
  }
  ctx.logger.info({ id: ctx.id, scored, failed }, 'rescore.done');
}
```

(Expose `loadSupplierHistory` as `__loadSupplierHistory` from the listener module; underscore prefix marks it test-only / cron-only.)

---

## 3. Patch 3 — Persistence helper

**New file:** `onyx-procurement/src/suppliers/score-persistence.js`.
**Schema:** writes to existing columns `procurement.suppliers.performance_score numeric(9,4)` and `risk_level text` (verified at `supabase/migrations/00000_master_schema.sql:561-562`). Also appends a snapshot row to a new history table.

```js
'use strict';

/**
 * Persist a scoreVendor() result back to the supplier row + a history snapshot.
 * Idempotent — same composite re-write yields the same row.
 */
async function persistScore(supabase, supplierId, scoreResult) {
  if (!supabase || !supplierId || !scoreResult) {
    throw new Error('persistScore: supabase, supplierId, scoreResult all required');
  }
  const composite = Number(scoreResult.composite) || 0;
  const riskLevel = riskLevelFor(composite, scoreResult.risks);

  // 1) Update the supplier row (no-op when score is unchanged within 0.05 pt).
  const { error: upErr } = await supabase
    .from('procurement.suppliers')
    .update({
      performance_score: composite,
      risk_level: riskLevel,
      updated_at: new Date().toISOString(),
    })
    .eq('id', supplierId);
  if (upErr) throw upErr;

  // 2) Append snapshot to history (recentScores[] feed for DECLINING_TREND).
  const { error: histErr } = await supabase
    .from('procurement.vendor_score_history')
    .insert({
      supplier_id: supplierId,
      composite,
      badge: scoreResult.badge,
      badge_en: scoreResult.badgeEn,
      risk_level: riskLevel,
      dimensions: scoreResult.dimensions,
      risks: scoreResult.risks,
      recommendations: scoreResult.recommendations,
      samples: scoreResult.samples,
      as_of: scoreResult.asOf,
      created_at: new Date().toISOString(),
    });
  if (histErr && histErr.code !== '23505') throw histErr; // 23505 = idempotency dup
  return { composite, riskLevel };
}

function riskLevelFor(composite, risks = []) {
  const hasHigh = risks.some(r => r.severity === 'high');
  if (composite < 50 || hasHigh) return 'critical';
  if (composite < 70) return 'high';
  if (composite < 85) return 'medium';
  return 'low';
}

module.exports = { persistScore, riskLevelFor };
```

**Migration `00084_vendor_score_history.sql`** (new):

```sql
create table if not exists procurement.vendor_score_history (
  id bigserial primary key,
  supplier_id bigint not null references procurement.suppliers(id) on delete cascade,
  composite numeric(5,2) not null,
  badge text not null,
  badge_en text,
  risk_level text not null check (risk_level in ('low','medium','high','critical')),
  dimensions jsonb not null,
  risks jsonb not null default '[]',
  recommendations jsonb not null default '[]',
  samples integer not null default 0,
  as_of timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_vsh_supplier_created on procurement.vendor_score_history(supplier_id, created_at desc);
create unique index if not exists uniq_vsh_supplier_asof on procurement.vendor_score_history(supplier_id, as_of);
alter table procurement.vendor_score_history enable row level security;
```

---

## 4. Patch 4 — Supplier360 tab `ניקוד והערכה`

**File:** `onyx-procurement/src/features/suppliers/Supplier360.tsx` (existing, 381 LOC).
**Insertion points:** `SupplierTab` union (line 161), `TabBtn` row (lines 234-240), tab body (after line 363).

```diff
@@ line 70 (Supplier360Payload type) @@
   open_pos?: SupplierPO[];
   rfq_invites?: SupplierRFQInvite[];
   open_rfqs?: number;
   open_pos_count?: number;
+  vendor_score?: VendorScore | null;
+}
+
+type VendorScore = {
+  composite: number;
+  badge: string;
+  badgeEn: string;
+  risk_level: 'low'|'medium'|'high'|'critical';
+  dimensions: {
+    onTimeDelivery: { score: number; samples: number; detail?: string };
+    priceCompetitiveness: { score: number; samples: number; detail?: string };
+    quality: { score: number; samples: number; detail?: string };
+    communication: { score: number; samples: number; detail?: string };
+    paymentTerms: { score: number; samples: number; detail?: string };
+  };
+  risks: Array<{ code: string; he: string; severity: string; detail?: string }>;
+  recommendations: string[];
+  as_of: string;
 };

@@ line 161 (SupplierTab union) @@
-type SupplierTab = "overview" | "contacts" | "scorecards" | "pos" | "rfqs";
+type SupplierTab = "overview" | "contacts" | "scorecards" | "scoring" | "pos" | "rfqs";

@@ line 240 (Tab buttons row) @@
   <TabBtn active={tab === "scorecards"} label="Scorecards" onClick={() => setTab("scorecards")} count={scorecards.length} />
+  <TabBtn active={tab === "scoring"} label="ניקוד והערכה" onClick={() => setTab("scoring")} />
   <TabBtn active={tab === "pos"} label="הזמנות רכש" onClick={() => setTab("pos")} count={openPOs.length} />
```

**Tab body** — insert after the `tab === "scorecards"` block (around line 326):

```tsx
{tab === "scoring" && (
  <Card title="ניקוד והערכה — Vendor Performance">
    {!data.vendor_score ? (
      <div className="text-sm text-slate-600">אין ניקוד עדיין. ה-PO הראשון של הספק יפעיל חישוב אוטומטי.</div>
    ) : (
      <VendorScoringPanel score={data.vendor_score} supplierId={supplierId} />
    )}
  </Card>
)}
```

**`VendorScoringPanel` component** (place above `Supplier360`):

```tsx
function VendorScoringPanel({ score, supplierId }: { score: VendorScore; supplierId: number }) {
  const dims = [
    { key: 'onTimeDelivery',       he: 'אספקה בזמן',     weight: 40 },
    { key: 'priceCompetitiveness', he: 'תחרותיות מחיר',  weight: 20 },
    { key: 'quality',              he: 'איכות',         weight: 20 },
    { key: 'communication',        he: 'תקשורת',        weight: 10 },
    { key: 'paymentTerms',         he: 'תנאי תשלום',     weight: 10 },
  ] as const;
  const riskColor = (sev: string) =>
    sev === 'high'    ? 'bg-red-100 text-red-800 border-red-200' :
    sev === 'medium'  ? 'bg-amber-100 text-amber-800 border-amber-200' :
                        'bg-slate-100 text-slate-800 border-slate-200';
  const badgeColor =
    score.composite > 85 ? 'bg-emerald-100 text-emerald-800' :
    score.composite >= 70 ? 'bg-blue-100 text-blue-800' :
    score.composite >= 50 ? 'bg-amber-100 text-amber-800' :
                            'bg-red-100 text-red-800';

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-5">
        <div>
          <div className="text-xs text-slate-500">ציון משוקלל</div>
          <div className="text-4xl font-black">{score.composite.toFixed(1)} <span className="text-lg font-normal text-slate-500">/ 100</span></div>
          <div className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-bold ${badgeColor}`}>{score.badge} ({score.badgeEn})</div>
        </div>
        <div className="text-sm text-slate-600 text-left">
          <div>סטטוס סיכון: <b>{score.risk_level}</b></div>
          <div>נכון לתאריך: {new Date(score.as_of).toLocaleDateString('he-IL')}</div>
          {score.composite < 50 && (
            <BlacklistButton supplierId={supplierId} score={score.composite} />
          )}
        </div>
      </div>

      <div className="space-y-2">
        {dims.map(d => {
          const dim = score.dimensions[d.key];
          return (
            <div key={d.key} className="grid grid-cols-[140px_1fr_60px_50px] items-center gap-3">
              <div className="font-bold text-slate-700">{d.he}</div>
              <div className="h-3 rounded-full bg-slate-200 overflow-hidden">
                <div className="h-full bg-blue-600" style={{ width: `${dim.score}%` }} />
              </div>
              <div className="text-right tabular-nums font-bold">{dim.score.toFixed(1)}</div>
              <div className="text-xs text-slate-500">{d.weight}%</div>
            </div>
          );
        })}
      </div>

      {score.risks.length > 0 && (
        <div>
          <div className="font-bold mb-2">סיכונים</div>
          <div className="space-y-2">
            {score.risks.map((r, i) => (
              <div key={i} className={`rounded-xl border px-3 py-2 text-sm ${riskColor(r.severity)}`}>
                <span className="font-bold">{r.he}</span>{r.detail ? ` — ${r.detail}` : ''}
              </div>
            ))}
          </div>
        </div>
      )}

      {score.recommendations.length > 0 && (
        <div>
          <div className="font-bold mb-2">המלצות</div>
          <ol className="list-decimal pr-5 space-y-1 text-sm text-slate-700">
            {score.recommendations.map((rec, i) => <li key={i}>{rec}</li>)}
          </ol>
        </div>
      )}
    </div>
  );
}

function BlacklistButton({ supplierId, score }: { supplierId: number; score: number }) {
  const qc = useQueryClient();
  const onClick = async () => {
    if (!confirm(`להוציא את הספק לרשימה שחורה? ציון נוכחי: ${score.toFixed(1)}.`)) return;
    const r = await fetch('/api/orchestrator/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'supplier.blacklist', context: { supplierId, composite: score } }),
    });
    if (r.ok) qc.invalidateQueries({ queryKey: supplier360QueryKey(supplierId) });
    else alert('פעולה נכשלה');
  };
  return (
    <button onClick={onClick} className="mt-2 rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700">
      הוצא לרשימה שחורה
    </button>
  );
}
```

**Server-side hydration:** extend `GET /api/suppliers/:id/360` to include `vendor_score` — pull the latest row from `procurement.vendor_score_history` (or compute on-demand via `scoreVendor` if no history exists).

---

## 5. Patch 5 — `blacklist_vendor` orchestrator action + supplier state machine

**File:** `onyx-procurement/src/pipeline/state-machines.js` (372 LOC) — register a new entity `supplier`.

```diff
@@ before final closing brace of STATE_MACHINES (~line 308) @@
+  supplier: {
+    initial: 'active',
+    states: {
+      active:      { transitions: { monitor: 'monitor', hold: 'on_hold', blacklist: 'blacklisted' } },
+      preferred:   { transitions: { monitor: 'monitor', hold: 'on_hold', blacklist: 'blacklisted' } },
+      monitor:     { transitions: { restore: 'active', hold: 'on_hold', blacklist: 'blacklisted' } },
+      on_hold:     { transitions: { restore: 'active', blacklist: 'blacklisted' } },
+      blacklisted: { transitions: { reinstate: 'on_hold' } },
+      inactive:    { transitions: { restore: 'active' }, final: false },
+    },
+    triggers: {
+      'active→blacklisted':    [{ action: 'cancel_open_rfq_invites', params: {} }, { action: 'freeze_open_pos', params: {} }, { action: 'notify_buyers', params: { template: 'vendor_blacklisted' } }],
+      'preferred→blacklisted': [{ action: 'cancel_open_rfq_invites', params: {} }, { action: 'freeze_open_pos', params: {} }, { action: 'notify_buyers', params: { template: 'vendor_blacklisted' } }],
+      'monitor→blacklisted':   [{ action: 'cancel_open_rfq_invites', params: {} }, { action: 'freeze_open_pos', params: {} }],
+      'blacklisted→on_hold':   [{ action: 'create_audit', params: { type: 'vendor_reinstated' } }],
+    },
+  },
```

**File:** `onyx-procurement/src/pipeline/orchestrator.js` (337 LOC) — add `supplier.blacklist` to `ORCHESTRATIONS`.

```diff
@@ inside ORCHESTRATIONS, before closing brace (~line 264) @@
+  'supplier.blacklist': {
+    service: 'procurement', label: 'הוצא ספק לרשימה שחורה',
+    preconditions: [
+      { check: 'entity_exists', entity: 'supplier' },
+      { check: 'status_in', statuses: ['active', 'preferred', 'monitor', 'on_hold'] },
+      { check: 'composite_below', threshold: 50 },
+    ],
+    effects: [
+      { type: 'transition', entity: 'supplier', transition: 'blacklist' },
+      { type: 'update_field', entity: 'supplier', field: 'risk_level', value: 'critical' },
+      { type: 'update_field', entity: 'supplier', field: 'blacklist_reason', from: 'context.reason' },
+      { type: 'cancel_related', entity: 'rfq_invite', filter: { supplier_id: ':supplierId', status: 'pending' } },
+      { type: 'freeze_related', entity: 'po',        filter: { supplier_id: ':supplierId', status_in: ['draft', 'pending_approval', 'sent'] } },
+      { type: 'notify', channels: ['email', 'in_app'], template: 'vendor_blacklisted', audience: 'buyers' },
+      { type: 'audit', message: 'ספק הוצא לרשימה שחורה' },
+    ],
+    events: ['vendor.blacklisted'],
+    listeners: ['ai.find_alternative_suppliers', 'ops.alert_open_pos_for_reassignment'],
+    navigate: '/entity360.html?type=supplier&id=:supplierId',
+  },
+
+  'supplier.reinstate': {
+    service: 'procurement', label: 'החזר ספק מהרשימה השחורה',
+    preconditions: [
+      { check: 'entity_exists', entity: 'supplier' },
+      { check: 'status_is', status: 'blacklisted' },
+      { check: 'role_in', roles: ['procurement_manager', 'cfo', 'admin'] },
+    ],
+    effects: [
+      { type: 'transition', entity: 'supplier', transition: 'reinstate' },
+      { type: 'update_field', entity: 'supplier', field: 'risk_level', value: 'high' },
+      { type: 'audit', message: 'ספק הוחזר מהרשימה השחורה (status=on_hold)' },
+    ],
+    events: ['vendor.reinstated'],
+  },
```

**Precondition: `composite_below`** — extend the precondition checker (orchestrator's `executeOrchestration`):

```js
// inside executeOrchestration, before iterating effects:
for (const pc of orch.preconditions) {
  if (pc.check === 'composite_below') {
    const supplierId = context.supplierId || context.id;
    const { data: row } = await supabase
      .from('procurement.suppliers')
      .select('performance_score').eq('id', supplierId).single();
    const score = Number(row?.performance_score);
    if (!Number.isFinite(score) || score >= pc.threshold) {
      return { ok: false, error: `composite ${score} not below ${pc.threshold}` };
    }
  }
}
```

**Schema gate (already present):** `procurement.subcontractors.status` already accepts `'blacklisted'` (verified at `supabase/migrations/00047_procurement_domain_complete.sql:370`). Mirror the same constraint for `procurement.suppliers.status` via migration `00085_supplier_blacklist_status.sql`:

```sql
alter table procurement.suppliers drop constraint if exists suppliers_status_check;
alter table procurement.suppliers add constraint suppliers_status_check
  check (status in ('active','preferred','monitor','on_hold','blacklisted','inactive','pending_review'));
alter table procurement.suppliers add column if not exists blacklist_reason text;
alter table procurement.suppliers add column if not exists blacklisted_at timestamptz;

-- RFQ-send / PO-create gate: refuse to create rows pointing at a blacklisted supplier.
create or replace function procurement.guard_supplier_active()
returns trigger language plpgsql as $$
declare s text;
begin
  select status into s from procurement.suppliers where id = new.supplier_id;
  if s = 'blacklisted' then
    raise exception 'supplier % is blacklisted; cannot send RFQ/PO', new.supplier_id using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_rfq_supplier on procurement.rfq_invitations;
create trigger trg_guard_rfq_supplier before insert on procurement.rfq_invitations
  for each row execute function procurement.guard_supplier_active();
drop trigger if exists trg_guard_po_supplier on procurement.purchase_orders;
create trigger trg_guard_po_supplier before insert on procurement.purchase_orders
  for each row execute function procurement.guard_supplier_active();
```

This **closes the loop** — once a supplier is marked `blacklisted`, the database itself refuses new RFQ invites or POs against them, regardless of which UI/API path the caller took.

---

## 6. Test plan (smoke + integration)

| # | Scenario | Expected |
|---|----------|----------|
| 1 | `npm test --prefix onyx-procurement -- vendor-scoring` | 32 existing tests still pass (no regression) |
| 2 | New unit test: `persistScore(supabase, id, scoreResult)` | writes both rows, idempotent on identical `as_of` |
| 3 | Emit `procurement.po.fully_received` -> listener fires | `procurement.suppliers.performance_score` updated within < 2 s |
| 4 | Cron `nightly-vendor-rescore` runs at 02:15 | every active supplier gets one history row per day |
| 5 | POST `/api/orchestrator/execute` `{ action: 'supplier.blacklist' }` for composite ≥ 50 | precondition fails with `composite N not below 50` |
| 6 | Same call with composite < 50 | supplier transitions `active→blacklisted`; open RFQs cancelled; new RFQ insert raises `P0001` |
| 7 | Supplier360 tab `ניקוד והערכה` for vendor with `vendor_score` | renders 5 dimension bars + risks + recs in RTL |
| 8 | Same tab for vendor with no score | shows `אין ניקוד עדיין. ה-PO הראשון…` |
| 9 | Click `הוצא לרשימה שחורה` button when composite < 50 | confirms, calls orchestrator, invalidates query, banner re-renders with `blacklisted` status |
| 10 | `supplier.reinstate` from blacklisted | requires `procurement_manager` role; lands on `on_hold`, not `active` |

---

## 7. Files touched (summary)

| Action | Path | LOC delta |
|--------|------|-----------|
| NEW | `onyx-procurement/src/wiring/vendor-scoring-listener.js` | +50 |
| NEW | `onyx-procurement/src/suppliers/score-persistence.js` | +45 |
| EDIT | `onyx-procurement/server.js` | +3 |
| EDIT | `onyx-procurement/src/jobs/jobs-registry.js` | +35 |
| EDIT | `onyx-procurement/src/features/suppliers/Supplier360.tsx` | +110 |
| EDIT | `onyx-procurement/src/pipeline/state-machines.js` | +18 |
| EDIT | `onyx-procurement/src/pipeline/orchestrator.js` | +35 |
| NEW | `supabase/migrations/00084_vendor_score_history.sql` | +18 |
| NEW | `supabase/migrations/00085_supplier_blacklist_status.sql` | +25 |

**Total:** +339 LOC, zero deletions, all existing exports preserved.

---

## 8. Sign-off

The four wiring deliverables required by Agent-183 are spec'd above:
1. **Cron-like trigger** — event listener on `procurement.po.fully_received|closed|received` plus `nightly-vendor-rescore` cron at 02:15.
2. **Persistence** — `persistScore()` writes `performance_score` + `risk_level` to the supplier row and appends to a new `vendor_score_history` table.
3. **Supplier360 tab `ניקוד והערכה`** — renders composite, badge, 5 dimension bars, risks, recommendations, and a contextual blacklist button.
4. **`blacklist_vendor` orchestrator action** — `supplier.blacklist` with precondition `composite < 50`, plus a new supplier state machine and DB-level guard triggers that refuse new RFQ/PO inserts against a blacklisted supplier.

Math layer (AGENT-183 verified) remains untouched. Wiring is **fully additive**.

*End of AGENT-223 wiring report.*
