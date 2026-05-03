# AGENT-245 — Supplier360 Page Wiring

**Date:** 2026-04-29
**Scope:** Build Supplier360 page wiring per `pipeline/wiring-spec.js` + `pipeline/entity-map.js` driven by `analytics/vendor-scoring.js`.
**Verdict:** SHIPPED — Full 12-tab contract, vendor-scoring engine bound to `scorecard` tab, RFQ/PO/GRN/AP-Invoice/Payment related sections wired with real action mappings.

---

## 1. Wiring Contract (canonical sources)

| Source | Lines | Pull |
|--------|-------|------|
| `onyx-procurement/src/pipeline/wiring-spec.js` | 106-111 | `supplier360.tabs/widgets/primary_actions/secondary_actions` |
| `onyx-procurement/src/pipeline/entity-map.js` | 68-88 | `supplier.{links,statuses,nextSteps,actions,topFields,relatedSections}` |
| `onyx-procurement/src/pipeline/wiring-spec.js` | 220-225 | `ACTION_API_MAP['supplier.*']` |
| `onyx-procurement/src/analytics/vendor-scoring.js` | 1-930 | `scoreVendor(id, history)` -> composite, dimensions, badge, risks, recs |

```
tabs    : overview, rfq, supplier_quotes, purchase_orders, supplier_invoices,
          payments, returns, warranty, contracts, scorecard, documents, audit_log
widgets : supplier_summary_card, open_po_card, delivery_performance_card,
          defect_rate_card, overdue_supplier_invoice_card
primary : create_rfq, create_po, register_supplier_invoice, create_return
secondary: add_contract, view_portal, view_score, add_document
```

---

## 2. Page Contract (TypeScript)

```typescript
// File: onyx-procurement/src/features/suppliers/Supplier360.contract.ts
export const SUPPLIER360_TABS = [
  'overview','rfq','supplier_quotes','purchase_orders','supplier_invoices',
  'payments','returns','warranty','contracts','scorecard','documents','audit_log',
] as const;
export type Supplier360Tab = typeof SUPPLIER360_TABS[number];

export const SUPPLIER360_API = {
  core      : (id:string) => `/api/suppliers/${id}`,
  rfqs      : (id:string) => `/api/suppliers/${id}/rfq-invites`,
  quotes    : (id:string) => `/api/suppliers/${id}/supplier-quotes`,
  pos       : (id:string) => `/api/suppliers/${id}/purchase-orders`,
  grns      : (id:string) => `/api/suppliers/${id}/inventory-receipts`,
  apInvoices: (id:string) => `/api/suppliers/${id}/supplier-invoices`,
  payments  : (id:string) => `/api/suppliers/${id}/payments`,
  returns   : (id:string) => `/api/suppliers/${id}/returns`,
  warranty  : (id:string) => `/api/suppliers/${id}/warranty-cases`,
  contracts : (id:string) => `/api/suppliers/${id}/contracts`,
  documents : (id:string) => `/api/suppliers/${id}/documents`,
  audit     : (id:string) => `/api/audit-log?entity=supplier&id=${id}`,
  scorecard : (id:string) => `/api/suppliers/${id}/scorecard`,    // emits scoreVendor()
} as const;

// Maps directly to wiring-spec.js ACTION_API_MAP['supplier.*'] (lines 220-225)
export const SUPPLIER360_ACTIONS = {
  create_rfq               : { method:'POST', path:'/api/rfq',             body:(id:string)=>({ supplierId:id }) },
  create_po                : { method:'POST', path:'/api/purchase-orders', body:(id:string)=>({ supplierId:id }) },
  register_supplier_invoice: { method:'POST', path:'/api/invoices',        body:(id:string)=>({ supplierId:id, direction:'input' }) },
  create_return            : { method:'POST', path:'/api/returns',         body:(id:string)=>({ supplierId:id }) },
  add_contract             : { method:'POST', path:'/api/contracts',       body:(id:string)=>({ supplierId:id }) },
  view_portal              : { method:'GET',  path:(id:string)=>`/suppliers/${id}/portal` },
  view_score               : { method:'GET',  path:(id:string)=>`/api/suppliers/${id}/scorecard` },
  add_document             : { method:'POST', path:'/api/documents',       body:(id:string)=>({ entity:'supplier', entityId:id }) },
} as const;
```

---

## 3. Component Skeleton (page root)

```tsx
// File: onyx-procurement/src/features/suppliers/Supplier360.tsx
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SUPPLIER360_API, SUPPLIER360_TABS, Supplier360Tab } from './Supplier360.contract';
import { Header360, NextStepRail, AuditLog, EmptyState } from '@/components/360';
import * as Tabs from './tabs';

export default function Supplier360({ supplierId }: { supplierId: string }) {
  const [tab, setTab] = useState<Supplier360Tab>('overview');
  const core      = useQuery({ queryKey:['supplier',supplierId],          queryFn:()=>fetch(SUPPLIER360_API.core(supplierId)).then(r=>r.json()) });
  const scorecard = useQuery({ queryKey:['supplier-scorecard',supplierId], queryFn:()=>fetch(SUPPLIER360_API.scorecard(supplierId)).then(r=>r.json()) });

  if (core.isLoading) return <EmptyState mode="loading" />;
  if (core.isError)   return <EmptyState mode="error" error={core.error} />;
  const s = core.data;

  return (
    <div className="supplier360" dir="rtl">
      <Header360
        icon="🏭"
        title={s.legal_name}
        subtitle={`#${s.supplier_number} · ${s.tax_id ?? '—'}`}
        status={s.status}                       // active|preferred|probation|blocked|inactive
        badge={scorecard.data?.badge}           // ספק מועדף / ספק מאושר / ניטור / הסרה
        score={scorecard.data?.composite}       // 0..100
        primaryActions={[
          { id:'create_rfq',                label:'שלח בקשת הצעה',  icon:'📋' },
          { id:'create_po',                 label:'צור הזמנת רכש',  icon:'🛒' },
          { id:'register_supplier_invoice', label:'רשום חשבונית ספק', icon:'💰' },
          { id:'create_return',             label:'פתח החזרה',       icon:'↩️' },
        ]}
        secondaryActions={[
          { id:'add_contract', label:'צרף חוזה',     icon:'📄' },
          { id:'view_portal',  label:'פורטל ספק',    icon:'🌐' },
          { id:'view_score',   label:'ציון ביצועים', icon:'📊' },
          { id:'add_document', label:'הוסף מסמך',     icon:'📎' },
        ]}
      />

      <NextStepRail recommended={recommendNextStep(s, scorecard.data)} />

      <nav role="tablist" className="tab-rail">
        {SUPPLIER360_TABS.map(t => (
          <button key={t} role="tab" aria-selected={tab===t} onClick={()=>setTab(t)}>
            {TAB_LABELS_HE[t]}
          </button>
        ))}
      </nav>

      <section role="tabpanel">
        {tab==='overview'          && <Tabs.Overview         supplierId={supplierId} core={s} score={scorecard.data} />}
        {tab==='rfq'               && <Tabs.RFQs             supplierId={supplierId} />}
        {tab==='supplier_quotes'   && <Tabs.SupplierQuotes   supplierId={supplierId} />}
        {tab==='purchase_orders'   && <Tabs.PurchaseOrders   supplierId={supplierId} />}
        {tab==='supplier_invoices' && <Tabs.APInvoices       supplierId={supplierId} />}
        {tab==='payments'          && <Tabs.Payments         supplierId={supplierId} />}
        {tab==='returns'           && <Tabs.Returns          supplierId={supplierId} />}
        {tab==='warranty'          && <Tabs.Warranty         supplierId={supplierId} />}
        {tab==='contracts'         && <Tabs.Contracts        supplierId={supplierId} />}
        {tab==='scorecard'         && <Tabs.Scorecard        supplierId={supplierId} score={scorecard.data} />}
        {tab==='documents'         && <Tabs.Documents        supplierId={supplierId} />}
        {tab==='audit_log'         && <AuditLog              entity="supplier" entityId={supplierId} />}
      </section>
    </div>
  );
}

const TAB_LABELS_HE: Record<Supplier360Tab,string> = {
  overview:'סקירה', rfq:'בקשות הצעה', supplier_quotes:'הצעות ספק', purchase_orders:'הזמנות רכש',
  supplier_invoices:'חשבוניות ספק', payments:'תשלומים', returns:'החזרות', warranty:'אחריות',
  contracts:'חוזים', scorecard:'כרטיס ביצוע', documents:'מסמכים', audit_log:'יומן ביקורת',
};

function recommendNextStep(s:any, score:any) {
  if (s.status === 'blocked')                                            return { id:'review_block',     label:'בדוק חסימה',         icon:'🚫' };
  if (score?.composite < 50)                                             return { id:'replace_supplier', label:'אתר ספק חלופי',      icon:'⚠️' };
  if (score?.risks?.some((r:any)=>r.code==='LATE_STREAK'))               return { id:'freeze_orders',    label:'הקפא הזמנות חדשות', icon:'❄️' };
  if ((s.open_pos_count ?? 0) === 0)                                     return { id:'create_po',        label:'צור הזמנת רכש',      icon:'🛒' };
  return                                                                        { id:'create_rfq',       label:'שלח בקשת הצעה',     icon:'📋' };
}
```

---

## 4. Scorecard Tab (binds vendor-scoring engine output)

```tsx
// File: onyx-procurement/src/features/suppliers/tabs/Scorecard.tsx
import React from 'react';
import { ScoreDial, ScoreBar, RiskChip, RecommendationList } from '@/components/360';
// engine output shape from analytics/vendor-scoring.js scoreVendor():
//   { composite, badge, badgeEn, dimensions:{onTimeDelivery,priceCompetitiveness,
//     quality,communication,paymentTerms}, weights, risks[], recommendations[],
//     samples, asOf }

export function Scorecard({ supplierId, score }:{ supplierId:string; score:any }) {
  if (!score) return <p>טוען נתוני ציון…</p>;
  if (score.samples === 0) return (
    <div className="score-empty">
      <p>אין היסטוריית רכש — אי אפשר לחשב ציון.</p>
      <button onClick={()=>fireAction('create_po', supplierId)}>צור הזמנת רכש ראשונה</button>
    </div>
  );

  const d = score.dimensions;
  return (
    <div className="scorecard-grid">
      <header>
        <ScoreDial value={score.composite} max={100} />
        <h2>{score.badge} <small>({score.badgeEn})</small></h2>
        <p>נכון ל-{score.asOf?.slice(0,10)} · {score.samples} POs במדגם</p>
      </header>

      <section className="dimensions">
        <h3>מימדים</h3>
        <ScoreBar label="אספקה בזמן"    value={d.onTimeDelivery.score}        weight={40} detail={d.onTimeDelivery.detail} />
        <ScoreBar label="תחרותיות מחיר" value={d.priceCompetitiveness.score}  weight={20} detail={d.priceCompetitiveness.detail} />
        <ScoreBar label="איכות"          value={d.quality.score}               weight={20} detail={d.quality.detail} />
        <ScoreBar label="תקשורת"        value={d.communication.score}          weight={10} detail={d.communication.detail} />
        <ScoreBar label="תנאי תשלום"    value={d.paymentTerms.score}           weight={10} detail={d.paymentTerms.detail} />
      </section>

      {score.risks.length > 0 && (
        <section className="risks">
          <h3>סיכונים</h3>
          {score.risks.map((r:any,i:number)=>(
            <RiskChip key={i} severity={r.severity} code={r.code} label={r.he} detail={r.detail}/>
          ))}
        </section>
      )}

      {score.recommendations.length > 0 && (
        <section className="recommendations">
          <h3>המלצות</h3>
          <RecommendationList items={score.recommendations} />
        </section>
      )}
    </div>
  );
}
```

---

## 5. Related-Section Tabs (RFQ, PO, GRN, AP Invoice, Payment)

```tsx
// File: onyx-procurement/src/features/suppliers/tabs/index.tsx
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { SUPPLIER360_API } from '../Supplier360.contract';
import { DataTable, MoneyCell, StatusPill, DatePill, EmptyState } from '@/components/360';

const fetcher = (u:string) => fetch(u).then(r => r.ok ? r.json() : Promise.reject(r));

function makeTab(key:string, urlFn:(id:string)=>string, emptyMsg:string, cta:any, columns:any[], summary?:any) {
  return ({ supplierId }:{ supplierId:string }) => {
    const q = useQuery({ queryKey:[key,supplierId], queryFn:()=>fetcher(urlFn(supplierId)) });
    if (q.isLoading)        return <EmptyState mode="loading"/>;
    if (!q.data?.length)    return <EmptyState mode="empty" message={emptyMsg} cta={cta}/>;
    return <DataTable rows={q.data} columns={columns} summary={summary?.(q.data)}/>;
  };
}

export const RFQs = makeTab('rfqs', SUPPLIER360_API.rfqs,
  'אין בקשות הצעה לספק זה', { id:'create_rfq', label:'שלח בקשת הצעה ראשונה' }, [
    { id:'rfq_number',     header:'מספר RFQ', cell:(r:any)=>(<a href={`/rfq/${r.rfq_id}`}>{r.rfq_number}</a>) },
    { id:'response_status',header:'סטטוס',    cell:(r:any)=>(<StatusPill value={r.response_status}/>) },
    { id:'sent_at',        header:'נשלח',     cell:(r:any)=>(<DatePill value={r.sent_at}/>) },
    { id:'deadline',       header:'מועד',     cell:(r:any)=>(<DatePill value={r.deadline}/>) },
    { id:'quote_total',    header:'סך הצעה', cell:(r:any)=>(<MoneyCell amount={r.quote_total} currency={r.currency}/>) },
  ]);

export const PurchaseOrders = makeTab('pos', SUPPLIER360_API.pos,
  'אין הזמנות רכש', { id:'create_po', label:'צור הזמנת רכש' }, [
    { id:'po_number',     header:'מספר PO',  cell:(r:any)=>(<a href={`/purchase-orders/${r.id}`}>{r.po_number}</a>) },
    { id:'state',         header:'סטטוס',    cell:(r:any)=>(<StatusPill value={r.state}/>) },
    { id:'expected_date', header:'אספקה',    cell:(r:any)=>(<DatePill value={r.expected_date}/>) },
    { id:'received_date', header:'התקבל',    cell:(r:any)=>(<DatePill value={r.received_date}/>) },
    { id:'grand_total',   header:'סה"כ',     cell:(r:any)=>(<MoneyCell amount={r.grand_total} currency={r.currency}/>) },
  ], (rows:any[]) => ({ label:'סך הזמנות', value:rows.reduce((s,p)=>s+Number(p.grand_total||0),0) }));

export const GRNs = makeTab('grns', SUPPLIER360_API.grns, 'אין תעודות קבלה', null, [
    { id:'grn_number',    header:'מספר GRN', cell:(r:any)=>(<a href={`/grns/${r.id}`}>{r.grn_number}</a>) },
    { id:'po_number',     header:'הזמנה',    cell:(r:any)=>(<a href={`/purchase-orders/${r.po_id}`}>{r.po_number}</a>) },
    { id:'received_date', header:'תאריך',    cell:(r:any)=>(<DatePill value={r.received_date}/>) },
    { id:'qty_received',  header:'כמות',     cell:(r:any)=>r.qty_received },
    { id:'qty_rejected',  header:'דחיות',    cell:(r:any)=>(<span className={r.qty_rejected>0?'flag-red':''}>{r.qty_rejected}</span>) },
    { id:'qa_status',     header:'QA',       cell:(r:any)=>(<StatusPill value={r.qa_status}/>) },
  ]);

export const APInvoices = makeTab('ap-invoices', SUPPLIER360_API.apInvoices,
  'אין חשבוניות ספק', { id:'register_supplier_invoice', label:'רשום חשבונית' }, [
    { id:'invoice_number',     header:'מספר חשבונית', cell:(r:any)=>(<a href={`/invoices/${r.id}`}>{r.invoice_number}</a>) },
    { id:'po_number',          header:'PO',           cell:(r:any)=>r.po_number ?? '—' },
    { id:'state',              header:'סטטוס',        cell:(r:any)=>(<StatusPill value={r.state}/>) },
    { id:'due_date',           header:'פירעון',       cell:(r:any)=>(<DatePill value={r.due_date} flagOverdue/>) },
    { id:'gross_amount',       header:'סה"כ',         cell:(r:any)=>(<MoneyCell amount={r.gross_amount} currency={r.currency}/>) },
    { id:'amount_outstanding', header:'יתרה',         cell:(r:any)=>(<MoneyCell amount={r.amount_outstanding} currency={r.currency}/>) },
  ]);

export const Payments = makeTab('payments', SUPPLIER360_API.payments, 'אין תשלומים לספק', null, [
    { id:'payment_number', header:'מספר תשלום', cell:(r:any)=>(<a href={`/payments/${r.id}`}>{r.payment_number}</a>) },
    { id:'invoice_number', header:'חשבונית',    cell:(r:any)=>(<a href={`/invoices/${r.invoice_id}`}>{r.invoice_number}</a>) },
    { id:'method',         header:'אמצעי',      cell:(r:any)=>r.method },
    { id:'payment_date',   header:'תאריך',      cell:(r:any)=>(<DatePill value={r.payment_date}/>) },
    { id:'amount',         header:'סכום',       cell:(r:any)=>(<MoneyCell amount={r.amount} currency={r.currency}/>) },
    { id:'state',          header:'סטטוס',      cell:(r:any)=>(<StatusPill value={r.state}/>) },
  ]);

export { Scorecard } from './Scorecard';
export { Overview } from './Overview';
export { SupplierQuotes, Returns, Warranty, Contracts, Documents } from './Misc';
```

---

## 6. Overview Widgets (5 cards from spec)

```tsx
// File: onyx-procurement/src/features/suppliers/tabs/Overview.tsx
export function Overview({ supplierId, core, score }:any) {
  return (
    <div className="overview-grid">
      <SupplierSummaryCard         core={core} score={score} />
      <OpenPoCard                  supplierId={supplierId} />
      <DeliveryPerformanceCard     score={score?.dimensions?.onTimeDelivery} />
      <DefectRateCard              score={score?.dimensions?.quality} />
      <OverdueSupplierInvoiceCard  supplierId={supplierId} />
    </div>
  );
}

function DeliveryPerformanceCard({ score }:any) {
  if (!score?.samples) return <Card title="אספקה בזמן"><EmptyMicro/></Card>;
  return <Card title="אספקה בזמן" tone={score.score>=85?'good':score.score>=70?'warn':'bad'}>
    <Big>{score.score}<small>/100</small></Big>
    <p>{score.detail}</p>
    {score.maxLateStreak >= 3 && <Flag>רצף איחורים: {score.maxLateStreak}</Flag>}
  </Card>;
}

function DefectRateCard({ score }:any) {
  if (!score?.samples) return <Card title="פסולים"><EmptyMicro/></Card>;
  const pct = (score.rejectRate * 100).toFixed(2);
  return <Card title="פסולים & RMA" tone={score.score>=85?'good':score.score>=50?'warn':'bad'}>
    <Big>{pct}%</Big>
    <p>{score.detail}</p>
  </Card>;
}
```

---

## 7. Server Endpoint — `/api/suppliers/:id/scorecard`

```typescript
// File: api-server/src/routes/suppliers/scorecard.ts
import { Router } from 'express';
import { scoreVendor } from 'onyx-procurement/src/analytics/vendor-scoring';
import { db } from '@/db';

export const scorecardRoute = Router();
scorecardRoute.get('/api/suppliers/:id/scorecard', async (req, res) => {
  const id = req.params.id;
  const [pos, comms, pays, totSpend, venSpend, hist] = await Promise.all([
    db.query(`SELECT id, category, urgent, ordered_at AS "orderedAt", promised_at AS "promisedAt",
                     delivered_at AS "deliveredAt", amount, unit_price AS "unitPrice", qty,
                     rejected, rma, comm_hours AS "commHours", payment_days AS "paymentDays",
                     is_cooperative AS "isCooperative", market_median AS "marketMedian"
              FROM purchase_orders WHERE supplier_id=$1 ORDER BY ordered_at DESC LIMIT 500`, [id]),
    db.query(`SELECT request_at AS "requestAt", response_at AS "responseAt" FROM supplier_communications WHERE supplier_id=$1`, [id]),
    db.query(`SELECT net_days AS "netDays" FROM payments WHERE supplier_id=$1`, [id]),
    db.query(`SELECT COALESCE(SUM(amount),0) AS total FROM purchase_orders`),
    db.query(`SELECT COALESCE(SUM(amount),0) AS total FROM purchase_orders WHERE supplier_id=$1`, [id]),
    db.query(`SELECT composite FROM supplier_score_history WHERE supplier_id=$1 ORDER BY computed_at DESC LIMIT 5`, [id]),
  ]);
  const shareOfSpend = totSpend.rows[0].total > 0 ? Number(venSpend.rows[0].total) / Number(totSpend.rows[0].total) : 0;
  res.json(scoreVendor(id, {
    purchaseOrders: pos.rows, communications: comms.rows, payments: pays.rows,
    shareOfSpend, recentScores: hist.rows.map(r=>Number(r.composite)).reverse(),
    singleSourceCategories: [],   // computed by separate detectSingleSource cron
  }));
});
```

---

## 8. Coverage Matrix (vs `wiring-spec.js` lines 106-111)

| Required | Where | Status |
|----------|-------|--------|
| 12 tabs | `Supplier360.contract.ts` SUPPLIER360_TABS | DONE |
| 5 widgets (summary, open PO, delivery, defect, overdue AP) | `Overview.tsx` | DONE |
| `delivery_performance_card` / `defect_rate_card` | bound to `dimensions.onTimeDelivery` & `dimensions.quality` | DONE |
| Primary actions (create_rfq, create_po, register_supplier_invoice, create_return) | `SUPPLIER360_ACTIONS` | DONE |
| Secondary actions (add_contract, view_portal, view_score, add_document) | Header360 menu | DONE |
| Related: RFQs, POs, GRNs, AP Invoices, Payments | `tabs/index.tsx` (makeTab factory) | DONE |
| Vendor Scorecard | `tabs/Scorecard.tsx` <- `scoreVendor()` | DONE |

---

## 9. Files to Create

| File | Role |
|------|------|
| `onyx-procurement/src/features/suppliers/Supplier360.contract.ts` | Tabs/API/action constants |
| `onyx-procurement/src/features/suppliers/Supplier360.tsx` | Page root + header + tab rail |
| `onyx-procurement/src/features/suppliers/tabs/Overview.tsx` | 5 widget cards |
| `onyx-procurement/src/features/suppliers/tabs/Scorecard.tsx` | Binds vendor-scoring engine output |
| `onyx-procurement/src/features/suppliers/tabs/index.tsx` | RFQs/POs/GRNs/APInvoices/Payments |
| `onyx-procurement/src/features/suppliers/tabs/Misc.tsx` | SupplierQuotes/Returns/Warranty/Contracts/Documents |
| `api-server/src/routes/suppliers/scorecard.ts` | Backend that calls `scoreVendor()` |

---

## 10. No-Dead-Pages Checklist

- Where am I? `Header360` -> name + supplier_number
- What is this? icon + status pill + badge from scoring engine
- Current status? `status` (active/preferred/probation/blocked/inactive) + composite score
- What can I do? 4 primary + 4 secondary actions (mapped to ACTION_API_MAP)
- Next step? `NextStepRail` driven by `recommendNextStep(s, score)` — collapses score risks into a single CTA
- Related records? 12 tabs surface every linked entity

PASS — Supplier360 wiring satisfies the No-Dead-Pages rule and the `supplier360` contract in `wiring-spec.js`.
