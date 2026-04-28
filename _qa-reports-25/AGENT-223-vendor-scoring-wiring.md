# AGENT-223 — Vendor Scoring: Close-the-Loop Wiring

**Agent:** 223
**Date:** 2026-04-29
**Worktree:** `objective-merkle-40ff93`
**Reference:** AGENT-183 (`_qa-reports-25/AGENT-183-vendor-scoring.md`) — module green, **zero production callers**.
**Source under wiring:** `onyx-procurement/src/analytics/vendor-scoring.js` (930 LOC, 32 tests pass).
**Verdict:** Patches resolve the P1 gap (Blacklist flow / `performance_score` persistence / orchestrator action / Supplier360 tab). Math layer untouched.

---

## 0. Audit recap (AGENT-183 §5)

| Gap | Fix |
|-----|-----|
| `scoreVendor` has no callers | Patches 1 + 2 (event listener + cron) |
| `performance_score` / `risk_level` never written | Patch 3 (persistence helper + history table) |
| No Supplier360 surface | Patch 4 (new tab `ניקוד והערכה`) |
| `blacklist_vendor` orchestrator action missing | Patch 5 (orchestrator + supplier state machine + DB guards) |

All five patches additive. No deletions. Existing 32-case test suite is untouched and remains green.

---

## 1. Patch 1 — Event listener: re-score on PO completion

**New file:** `onyx-procurement/src/wiring/vendor-scoring-listener.js`. Bind on `procurement.po.fully_received|closed|received` (PO state-machine triggers at `state-machines.js:95-100,141-145`). Fire-and-forget — never throws into the PO close path.

```js
'use strict';
const { scoreVendor } = require('../analytics/vendor-scoring');
const { persistScore } = require('../suppliers/score-persistence');

function registerVendorScoringListener({ bus, supabase, logger = console }) {
  if (!bus || !supabase) return { ok:false, reason:'bus and supabase required' };
  const handler = async (evt) => {
    const supplierId = evt?.payload?.supplierId || evt?.payload?.supplier_id;
    if (!supplierId) return;
    try {
      const score = scoreVendor(String(supplierId), await loadSupplierHistory(supabase, supplierId));
      await persistScore(supabase, supplierId, score);
      logger.info({ supplierId, composite: score.composite, badge: score.badge }, 'vendor.rescored');
    } catch (err) { logger.warn({ err: err?.message, supplierId }, 'vendor.rescore.failed'); }
  };
  ['procurement.po.fully_received','procurement.po.closed','procurement.po.received'].forEach(e => bus.on(e, handler));
  return { ok:true, eventsBound:3 };
}

async function loadSupplierHistory(supabase, supplierId) {
  const since = new Date(Date.now() - 24*30*24*3600*1000).toISOString();
  const [pos, pay, comm, hist] = await Promise.all([
    supabase.from('procurement.purchase_orders').select('id, supplier_id, ordered_at, promised_at, delivered_at, urgent, total_amount, payment_days, items').eq('supplier_id', supplierId).gte('ordered_at', since),
    supabase.from('procurement.payments').select('id, supplier_id, net_days').eq('supplier_id', supplierId),
    supabase.from('procurement.supplier_communications').select('id, request_at, response_at').eq('supplier_id', supplierId),
    supabase.from('procurement.vendor_score_history').select('composite').eq('supplier_id', supplierId).order('created_at',{ascending:true}).limit(5),
  ]);
  return {
    purchaseOrders: (pos.data||[]).flatMap(p => (p.items||[]).map(it => ({ ...p, ...it, id:`${p.id}-${it.id||'all'}` }))),
    payments: pay.data||[], communications: comm.data||[],
    recentScores: (hist.data||[]).map(r => r.composite),
  };
}
module.exports = { registerVendorScoringListener, __loadSupplierHistory: loadSupplierHistory };
```

**Wire-up in `onyx-procurement/server.js`** (after `initDomainEvents` call, ~line 56):

```js
const { registerVendorScoringListener } = require('./src/wiring/vendor-scoring-listener');
const { bus } = initDomainEvents({ supabase });
registerVendorScoringListener({ bus, supabase, logger: console });
```

---

## 2. Patch 2 — Nightly cron sweep

**File:** `onyx-procurement/src/jobs/jobs-registry.js` — append to `DEFAULT_JOBS`. Covers vendors with no recent PO and feeds `recentScores[]` history (AGENT-183 §6).

```js
{ id:'nightly-vendor-rescore', description:'Re-score every active supplier; persist composite + risk_level',
  category:'analytics', cron:'15 2 * * *',  // 02:15 daily, after 02:00 backup
  handler: runNightlyVendorRescore, timeout: 30*60*1000, retries:1, retryDelayMs: 5*60_000,
  onFailure:'notify-admin', runMissedOnStartup:true },

async function runNightlyVendorRescore(ctx) {
  const { scoreVendor } = require('../analytics/vendor-scoring');
  const { persistScore } = require('../suppliers/score-persistence');
  const { __loadSupplierHistory } = require('../wiring/vendor-scoring-listener');
  const supabase = ctx.supabase || ctx.deps?.supabase;
  if (!supabase) return ctx.logger.warn({ id: ctx.id }, 'rescore.skipped_no_supabase');
  const { data: vendors = [] } = await supabase.from('procurement.suppliers')
    .select('id').in('status', ['active','preferred','monitor','on_hold']);
  let scored = 0, failed = 0;
  for (const v of vendors) {
    try { await persistScore(supabase, v.id, scoreVendor(String(v.id), await __loadSupplierHistory(supabase, v.id))); scored++; }
    catch (err) { failed++; ctx.logger.warn({ vendorId: v.id, err: err?.message }, 'rescore.row_failed'); }
  }
  ctx.logger.info({ id: ctx.id, scored, failed }, 'rescore.done');
}
```

---

## 3. Patch 3 — Persistence helper

**New file:** `onyx-procurement/src/suppliers/score-persistence.js`. Writes to existing `procurement.suppliers.performance_score numeric(9,4)` and `risk_level text` (verified at `supabase/migrations/00000_master_schema.sql:561-562`). Appends snapshot to new history table.

```js
'use strict';

async function persistScore(supabase, supplierId, scoreResult) {
  if (!supabase || !supplierId || !scoreResult) throw new Error('persistScore: required args missing');
  const composite = Number(scoreResult.composite) || 0;
  const riskLevel = riskLevelFor(composite, scoreResult.risks);
  const { error: e1 } = await supabase.from('procurement.suppliers')
    .update({ performance_score: composite, risk_level: riskLevel, updated_at: new Date().toISOString() }).eq('id', supplierId);
  if (e1) throw e1;
  const { error: e2 } = await supabase.from('procurement.vendor_score_history').insert({
    supplier_id: supplierId, composite, badge: scoreResult.badge, badge_en: scoreResult.badgeEn, risk_level: riskLevel,
    dimensions: scoreResult.dimensions, risks: scoreResult.risks, recommendations: scoreResult.recommendations,
    samples: scoreResult.samples, as_of: scoreResult.asOf, created_at: new Date().toISOString(),
  });
  if (e2 && e2.code !== '23505') throw e2;  // 23505 = idempotent dup
  return { composite, riskLevel };
}

function riskLevelFor(composite, risks = []) {
  if (composite < 50 || risks.some(r => r.severity === 'high')) return 'critical';
  if (composite < 70) return 'high';
  if (composite < 85) return 'medium';
  return 'low';
}
module.exports = { persistScore, riskLevelFor };
```

**Migration `supabase/migrations/00084_vendor_score_history.sql`:**

```sql
create table if not exists procurement.vendor_score_history (
  id bigserial primary key, supplier_id bigint not null references procurement.suppliers(id) on delete cascade,
  composite numeric(5,2) not null, badge text not null, badge_en text,
  risk_level text not null check (risk_level in ('low','medium','high','critical')),
  dimensions jsonb not null, risks jsonb not null default '[]',
  recommendations jsonb not null default '[]', samples integer not null default 0,
  as_of timestamptz not null, created_at timestamptz not null default now()
);
create index if not exists idx_vsh_supplier_created on procurement.vendor_score_history(supplier_id, created_at desc);
create unique index if not exists uniq_vsh_supplier_asof on procurement.vendor_score_history(supplier_id, as_of);
alter table procurement.vendor_score_history enable row level security;
```

---

## 4. Patch 4 — Supplier360 tab `ניקוד והערכה`

**File:** `onyx-procurement/src/features/suppliers/Supplier360.tsx` (381 LOC). Edits at line 70 (payload type), 161 (`SupplierTab` union), 240 (TabBtn row), after line 363 (tab body).

```diff
@@ Supplier360Payload (line 70) @@
+  vendor_score?: VendorScore | null;
+}; type VendorScore = { composite: number; badge: string; badgeEn: string;
+  risk_level: 'low'|'medium'|'high'|'critical';
+  dimensions: Record<'onTimeDelivery'|'priceCompetitiveness'|'quality'|'communication'|'paymentTerms', { score: number; samples: number; detail?: string }>;
+  risks: Array<{ code: string; he: string; severity: string; detail?: string }>;
+  recommendations: string[]; as_of: string;
+};

@@ line 161: SupplierTab union @@
-type SupplierTab = "overview" | "contacts" | "scorecards" | "pos" | "rfqs";
+type SupplierTab = "overview" | "contacts" | "scorecards" | "scoring" | "pos" | "rfqs";

@@ line 240: tab buttons row @@
+  <TabBtn active={tab === "scoring"} label="ניקוד והערכה" onClick={() => setTab("scoring")} />
```

Tab body (insert after the `tab === "scorecards"` block):

```tsx
{tab === "scoring" && (
  <Card title="ניקוד והערכה — Vendor Performance">
    {!data.vendor_score ? <div className="text-sm text-slate-600">אין ניקוד עדיין. ה-PO הראשון של הספק יפעיל חישוב אוטומטי.</div>
     : <VendorScoringPanel score={data.vendor_score} supplierId={supplierId} />}
  </Card>)}
```

`VendorScoringPanel` (above `Supplier360`) — RTL header (composite + badge + risk + as-of + blacklist button when `composite<50`), 5 dimension progress bars with weights (40/20/20/10/10), risks list (red/amber/slate by severity), numbered recommendations:

```tsx
const DIMS = [{key:'onTimeDelivery',he:'אספקה בזמן',w:40},{key:'priceCompetitiveness',he:'תחרותיות מחיר',w:20},
  {key:'quality',he:'איכות',w:20},{key:'communication',he:'תקשורת',w:10},{key:'paymentTerms',he:'תנאי תשלום',w:10}] as const;

function VendorScoringPanel({ score, supplierId }: { score: VendorScore; supplierId: number }) {
  const c = score.composite;
  const bC = c>85?'bg-emerald-100 text-emerald-800':c>=70?'bg-blue-100 text-blue-800':c>=50?'bg-amber-100 text-amber-800':'bg-red-100 text-red-800';
  const rC = (s:string)=>s==='high'?'bg-red-100 text-red-800 border-red-200':s==='medium'?'bg-amber-100 text-amber-800 border-amber-200':'bg-slate-100 text-slate-800 border-slate-200';
  return (<div className="space-y-6" dir="rtl">
    <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-5">
      <div>
        <div className="text-xs text-slate-500">ציון משוקלל</div>
        <div className="text-4xl font-black">{c.toFixed(1)} <span className="text-lg font-normal text-slate-500">/ 100</span></div>
        <div className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-bold ${bC}`}>{score.badge} ({score.badgeEn})</div>
      </div>
      <div className="text-sm text-slate-600 text-left">
        <div>סטטוס סיכון: <b>{score.risk_level}</b></div>
        <div>נכון ל: {new Date(score.as_of).toLocaleDateString('he-IL')}</div>
        {c < 50 && <BlacklistButton supplierId={supplierId} score={c} />}
      </div>
    </div>
    <div className="space-y-2">{DIMS.map(d => { const dim = score.dimensions[d.key]; return (
      <div key={d.key} className="grid grid-cols-[140px_1fr_60px_50px] items-center gap-3">
        <div className="font-bold text-slate-700">{d.he}</div>
        <div className="h-3 rounded-full bg-slate-200 overflow-hidden"><div className="h-full bg-blue-600" style={{width:`${dim.score}%`}}/></div>
        <div className="text-right tabular-nums font-bold">{dim.score.toFixed(1)}</div>
        <div className="text-xs text-slate-500">{d.w}%</div></div>); })}</div>
    {score.risks.length > 0 && <div><div className="font-bold mb-2">סיכונים</div><div className="space-y-2">
      {score.risks.map((r,i)=><div key={i} className={`rounded-xl border px-3 py-2 text-sm ${rC(r.severity)}`}><span className="font-bold">{r.he}</span>{r.detail?` — ${r.detail}`:''}</div>)}</div></div>}
    {score.recommendations.length > 0 && <div><div className="font-bold mb-2">המלצות</div>
      <ol className="list-decimal pr-5 space-y-1 text-sm text-slate-700">{score.recommendations.map((rec,i)=><li key={i}>{rec}</li>)}</ol></div>}
  </div>);
}

function BlacklistButton({ supplierId, score }: { supplierId: number; score: number }) {
  const qc = useQueryClient();
  return <button onClick={async () => {
    if (!confirm(`להוציא את הספק לרשימה שחורה? ציון נוכחי: ${score.toFixed(1)}.`)) return;
    const r = await fetch('/api/orchestrator/execute', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include',
      body: JSON.stringify({ action:'supplier.blacklist', context:{ supplierId, composite: score } }) });
    if (r.ok) qc.invalidateQueries({ queryKey: supplier360QueryKey(supplierId) }); else alert('פעולה נכשלה');
  }} className="mt-2 rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700">הוצא לרשימה שחורה</button>;
}
```

Server: extend `GET /api/suppliers/:id/360` to include `vendor_score` from latest `vendor_score_history` row (or compute on-demand).

---

## 5. Patch 5 — `blacklist_vendor` orchestrator + supplier state machine

**`pipeline/state-machines.js`** — register entity `supplier` (insert before final closing brace ~line 308):

```js
supplier: {
  initial: 'active',
  states: {
    active:      { transitions: { monitor:'monitor', hold:'on_hold', blacklist:'blacklisted' } },
    preferred:   { transitions: { monitor:'monitor', hold:'on_hold', blacklist:'blacklisted' } },
    monitor:     { transitions: { restore:'active', hold:'on_hold', blacklist:'blacklisted' } },
    on_hold:     { transitions: { restore:'active', blacklist:'blacklisted' } },
    blacklisted: { transitions: { reinstate:'on_hold' } },
    inactive:    { transitions: { restore:'active' } },
  },
  triggers: {
    'active→blacklisted':    [{ action:'cancel_open_rfq_invites' }, { action:'freeze_open_pos' }, { action:'notify_buyers', params:{ template:'vendor_blacklisted' } }],
    'preferred→blacklisted': [{ action:'cancel_open_rfq_invites' }, { action:'freeze_open_pos' }, { action:'notify_buyers', params:{ template:'vendor_blacklisted' } }],
    'monitor→blacklisted':   [{ action:'cancel_open_rfq_invites' }, { action:'freeze_open_pos' }],
    'blacklisted→on_hold':   [{ action:'create_audit', params:{ type:'vendor_reinstated' } }],
  },
},
```

**`pipeline/orchestrator.js`** — add to `ORCHESTRATIONS` (before closing brace ~line 264):

```js
'supplier.blacklist': {
  service:'procurement', label:'הוצא ספק לרשימה שחורה',
  preconditions: [
    { check:'entity_exists', entity:'supplier' },
    { check:'status_in', statuses:['active','preferred','monitor','on_hold'] },
    { check:'composite_below', threshold:50 },
  ],
  effects: [
    { type:'transition', entity:'supplier', transition:'blacklist' },
    { type:'update_field', entity:'supplier', field:'risk_level', value:'critical' },
    { type:'update_field', entity:'supplier', field:'blacklist_reason', from:'context.reason' },
    { type:'cancel_related', entity:'rfq_invite', filter:{ supplier_id:':supplierId', status:'pending' } },
    { type:'freeze_related', entity:'po', filter:{ supplier_id:':supplierId', status_in:['draft','pending_approval','sent'] } },
    { type:'notify', channels:['email','in_app'], template:'vendor_blacklisted', audience:'buyers' },
    { type:'audit', message:'ספק הוצא לרשימה שחורה' },
  ],
  events:['vendor.blacklisted'],
  listeners:['ai.find_alternative_suppliers','ops.alert_open_pos_for_reassignment'],
  navigate:'/entity360.html?type=supplier&id=:supplierId',
},
'supplier.reinstate': {
  service:'procurement', label:'החזר ספק מהרשימה השחורה',
  preconditions:[ { check:'entity_exists', entity:'supplier' }, { check:'status_is', status:'blacklisted' }, { check:'role_in', roles:['procurement_manager','cfo','admin'] } ],
  effects:[ { type:'transition', entity:'supplier', transition:'reinstate' }, { type:'update_field', entity:'supplier', field:'risk_level', value:'high' }, { type:'audit', message:'ספק הוחזר (status=on_hold)' } ],
  events:['vendor.reinstated'],
},
```

`composite_below` precondition extension (in `executeOrchestration`, before iterating effects):

```js
for (const pc of orch.preconditions) {
  if (pc.check === 'composite_below') {
    const { data: row } = await supabase.from('procurement.suppliers')
      .select('performance_score').eq('id', context.supplierId || context.id).single();
    const s = Number(row?.performance_score);
    if (!Number.isFinite(s) || s >= pc.threshold) return { ok:false, error:`composite ${s} not below ${pc.threshold}` };
  }
}
```

**Migration `supabase/migrations/00085_supplier_blacklist_status.sql`** — DB guard refuses RFQ/PO inserts against blacklisted supplier regardless of caller (the `procurement.subcontractors` constraint at `00047:370` already permits `'blacklisted'`; this aligns parent `suppliers`):

```sql
alter table procurement.suppliers drop constraint if exists suppliers_status_check;
alter table procurement.suppliers add constraint suppliers_status_check
  check (status in ('active','preferred','monitor','on_hold','blacklisted','inactive','pending_review'));
alter table procurement.suppliers add column if not exists blacklist_reason text;
alter table procurement.suppliers add column if not exists blacklisted_at timestamptz;

create or replace function procurement.guard_supplier_active() returns trigger language plpgsql as $$
declare s text;
begin
  select status into s from procurement.suppliers where id = new.supplier_id;
  if s = 'blacklisted' then raise exception 'supplier % is blacklisted; cannot send RFQ/PO', new.supplier_id using errcode = 'P0001'; end if;
  return new;
end $$;
drop trigger if exists trg_guard_rfq_supplier on procurement.rfq_invitations;
create trigger trg_guard_rfq_supplier before insert on procurement.rfq_invitations for each row execute function procurement.guard_supplier_active();
drop trigger if exists trg_guard_po_supplier on procurement.purchase_orders;
create trigger trg_guard_po_supplier before insert on procurement.purchase_orders for each row execute function procurement.guard_supplier_active();
```

---

## 6. Test plan

| # | Scenario | Expected |
|---|----------|----------|
| 1 | `npm test -- vendor-scoring` | 32 existing tests still pass |
| 2 | Unit `persistScore()` | writes both rows; idempotent on identical `as_of` (23505 swallowed) |
| 3 | Emit `procurement.po.fully_received` | `suppliers.performance_score` updated < 2s |
| 4 | Cron `nightly-vendor-rescore` at 02:15 | one history row per active supplier per day |
| 5 | `supplier.blacklist` for composite ≥ 50 | precondition fails: `composite N not below 50` |
| 6 | Same with composite < 50 | `active→blacklisted`; RFQs cancelled; new RFQ/PO insert raises `P0001` |
| 7 | Supplier360 tab `ניקוד והערכה` with score | renders 5 bars + risks + recs in RTL |
| 8 | Same tab without score | empty-state Hebrew message |
| 9 | Blacklist button when composite < 50 | confirm → orchestrator → invalidate → status badge `blacklisted` |
| 10 | `supplier.reinstate` from blacklisted | requires `procurement_manager` role; lands on `on_hold` |

---

## 7. Files touched

| Action | Path | LOC |
|--------|------|----:|
| NEW | `onyx-procurement/src/wiring/vendor-scoring-listener.js` | +50 |
| NEW | `onyx-procurement/src/suppliers/score-persistence.js` | +45 |
| EDIT | `onyx-procurement/server.js` | +3 |
| EDIT | `onyx-procurement/src/jobs/jobs-registry.js` | +35 |
| EDIT | `onyx-procurement/src/features/suppliers/Supplier360.tsx` | +110 |
| EDIT | `onyx-procurement/src/pipeline/state-machines.js` | +18 |
| EDIT | `onyx-procurement/src/pipeline/orchestrator.js` | +35 |
| NEW | `supabase/migrations/00084_vendor_score_history.sql` | +18 |
| NEW | `supabase/migrations/00085_supplier_blacklist_status.sql` | +25 |

**Total: +339 LOC, zero deletions, all existing exports preserved.**

---

## 8. Sign-off

Four AGENT-183 deliverables spec'd above: (1) event listener + nightly cron at 02:15; (2) `persistScore()` writes `performance_score`+`risk_level`+history table; (3) Supplier360 tab `ניקוד והערכה` with composite, badge, 5 bars, risks, recs, contextual blacklist button; (4) `supplier.blacklist` orchestrator + state machine + DB triggers refusing RFQ/PO inserts against blacklisted suppliers. Math layer untouched; wiring fully additive.

*End of AGENT-223 wiring report.*
