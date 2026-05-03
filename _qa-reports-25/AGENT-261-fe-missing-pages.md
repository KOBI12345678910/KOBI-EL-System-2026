# AGENT-261 — Frontend Missing Pages Scaffolds

**Agent:** 261 — FRONTEND #1 | **Date:** 2026-04-29 | **Worktree:** `objective-merkle-40ff93`
**Per:** Agent 204 — flagged 6 missing Master Flow pages
**Output:** Concrete React+TS scaffolds (RTL, Hebrew, wired to Supabase RPC + react-router)

---

## Existing baseline (already in repo)

`techno-kol-ops/client/src/pages/360/` contains 9 pages: Customer360, Employee360, Finance360, PO360, Project360, Quote360, RFQ360, Supplier360, WorkOrder360 + `shared360.tsx`.

Pattern (from `Quote360.tsx`):
- `useParams<{id:string}>` from react-router-dom
- `supabase.rpc("get_<entity>_360_fast", { p_<entity>_id: Number(id) })`
- Shared primitives: `Page360`, `KPI`, `RelatedTable`, `AuditLog`, `ActionBtn`, `Loader`, `ErrCard`
- Hebrew labels, parent layout sets `dir="rtl"`

## 6 Missing Pages (Master Flow)

`Lead -> Quote -> Approval -> Order -> Project -> WorkOrders -> Procurement -> Inventory -> Execution -> Delivery -> Invoice -> Payment -> Closure`

Missing 360s: **Lead, Order, InventoryItem, Delivery, Payment, Closure**.

All scaffolds below import the same boilerplate from `./shared360`:
```tsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { Page360, KPI, RelatedTable, AuditLog, ActionBtn, Loader, ErrCard } from "./shared360";
```
And use the same shape:
```tsx
const { id } = useParams<{ id: string }>();
const navigate = useNavigate();
const [data, setData] = useState<any>(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
useEffect(() => {
  if (!id) return;
  supabase.rpc("get_<X>_360_fast", { p_<X>_id: Number(id) })
    .then(({ data: p, error: e }) => { if (e) setError(e.message); else setData(p); setLoading(false); });
}, [id]);
if (loading) return <Loader label="טוען..." />;
if (error) return <ErrCard msg={error} />;
if (!data) return <ErrCard msg="לא נמצא" />;
```
Each page below shows only the unique JSX body (after the boilerplate).

---

## 1. Lead360.tsx — `pages/360/Lead360.tsx`

```tsx
const l = data.lead ?? {};
const convertToQuote = async () => {
  const { error: e } = await supabase.rpc("orchestrator_execute",
    { p_action: "convert_lead_to_quote", p_entity_id: Number(id) });
  if (!e) navigate(`/quote/new?lead=${id}`);
};
return (
  <Page360 title={`ליד ${l.lead_number ?? ""}`}
    subtitle={`${l.contact_name ?? ""} · ${l.company_name ?? ""} · ${l.source ?? ""}`}
    state={l.state}>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <KPI label="מקור" value={l.source ?? "—"} />
      <KPI label="ציון BANT" value={l.bant_score ?? "—"} />
      <KPI label="תקציב משוער" value={l.estimated_budget ? `₪${Number(l.estimated_budget).toLocaleString()}` : "—"} />
      <KPI label="ימים מאז יצירה" value={l.days_since_created ?? 0} />
    </div>
    <div className="flex gap-2 flex-wrap">
      <ActionBtn label="המר להצעת מחיר" onClick={convertToQuote} />
      <ActionBtn label="קבע פגישה" onClick={() => navigate(`/calendar/new?lead=${id}`)} variant="secondary" />
      <ActionBtn label="שלח אימייל" onClick={() => navigate(`/comms/new?lead=${id}`)} variant="secondary" />
      <ActionBtn label="סגור כלא רלוונטי" onClick={() => {}} variant="secondary" />
    </div>
    <RelatedTable title="פעילויות" rows={data.activities ?? []}
      cols={[{key:"activity_date",label:"תאריך"},{key:"activity_type",label:"סוג"},
             {key:"notes",label:"הערות"},{key:"owner_name",label:"אחראי"}]} />
    <RelatedTable title="הצעות מחיר שנוצרו" rows={data.quotes ?? []}
      cols={[{key:"quote_number",label:"מספר"},{key:"grand_total",label:"סכום"},{key:"state",label:"סטטוס"}]}
      onRowClick={(r) => navigate(`/quote/${r.id}`)} />
    <RelatedTable title="מסמכים" rows={data.documents ?? []}
      cols={[{key:"filename",label:"קובץ"},{key:"document_type",label:"סוג"}]} />
    <AuditLog entries={data.audit ?? []} />
  </Page360>
);
```

## 2. Order360.tsx — `pages/360/Order360.tsx`

```tsx
const o = data.order ?? {};
const createProject = async () => {
  const { data: r, error: e } = await supabase.rpc("orchestrator_execute",
    { p_action: "order_to_project", p_entity_id: Number(id) });
  if (!e && r?.project_id) navigate(`/project/${r.project_id}`);
};
return (
  <Page360 title={`הזמנה ${o.order_number ?? ""}`}
    subtitle={`${o.customer_name ?? ""} · ${o.order_date ?? ""}`} state={o.state}>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <KPI label="סכום כולל" value={o.grand_total ? `₪${Number(o.grand_total).toLocaleString()}` : "—"} />
      <KPI label="שורות" value={data.line_items?.length ?? 0} />
      <KPI label="תאריך אספקה" value={o.delivery_date ?? "—"} />
      <KPI label="תנאי תשלום" value={o.payment_terms ?? "—"} />
    </div>
    <div className="flex gap-2 flex-wrap">
      <ActionBtn label="פתח פרויקט" onClick={createProject} />
      <ActionBtn label="צור הזמנת רכש" onClick={() => navigate(`/po/new?order=${id}`)} variant="secondary" />
      <ActionBtn label="הדפס הזמנה" onClick={() => window.open(`/api/orders/${id}/print`, "_blank")} variant="secondary" />
      <ActionBtn label="בטל הזמנה" onClick={() => {}} variant="secondary" />
    </div>
    <RelatedTable title="שורות הזמנה" rows={data.line_items ?? []}
      cols={[{key:"line_number",label:"#"},{key:"description",label:"תיאור"},
             {key:"quantity",label:"כמות"},{key:"unit_price",label:"מחיר יחידה"},{key:"line_total",label:"סה״כ"}]} />
    <RelatedTable title="פרויקט מקושר" rows={data.projects ?? []}
      cols={[{key:"project_number",label:"מספר"},{key:"project_name",label:"שם"},
             {key:"progress_percent",label:"%"},{key:"state",label:"סטטוס"}]}
      onRowClick={(r) => navigate(`/project/${r.id}`)} />
    <RelatedTable title="הצעת מחיר מקור" rows={data.source_quote ? [data.source_quote] : []}
      cols={[{key:"quote_number",label:"מספר"},{key:"grand_total",label:"סכום"},{key:"state",label:"סטטוס"}]}
      onRowClick={(r) => navigate(`/quote/${r.id}`)} />
    <RelatedTable title="חשבוניות" rows={data.invoices ?? []}
      cols={[{key:"invoice_number",label:"מספר"},{key:"issue_date",label:"תאריך"},
             {key:"grand_total",label:"סכום"},{key:"balance_due",label:"יתרה"}]}
      onRowClick={(r) => navigate(`/finance/${r.id}`)} />
    <AuditLog entries={data.audit ?? []} />
  </Page360>
);
```

## 3. InventoryItem360.tsx — `pages/360/InventoryItem360.tsx`

```tsx
const it = data.item ?? {};
const lowStock = (it.on_hand_qty ?? 0) < (it.reorder_point ?? 0);
return (
  <Page360 title={`${it.item_code ?? ""} — ${it.item_name ?? ""}`}
    subtitle={`${it.category ?? ""} · ${it.uom ?? ""}`} state={lowStock ? "LowStock" : it.state}>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <KPI label="זמין במלאי" value={it.on_hand_qty ?? 0} color={lowStock ? "red" : "green"} />
      <KPI label="משוריין" value={it.reserved_qty ?? 0} />
      <KPI label="בהזמנה" value={it.on_order_qty ?? 0} />
      <KPI label="נקודת הזמנה" value={it.reorder_point ?? "—"} />
    </div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <KPI label="מחיר עלות" value={it.cost_price ? `₪${Number(it.cost_price).toLocaleString()}` : "—"} />
      <KPI label="מחיר מכירה" value={it.sell_price ? `₪${Number(it.sell_price).toLocaleString()}` : "—"} />
      <KPI label="ערך מלאי" value={`₪${Number((it.on_hand_qty ?? 0)*(it.cost_price ?? 0)).toLocaleString()}`} />
      <KPI label="ימי מלאי" value={it.days_of_stock ?? "—"} color={lowStock ? "red" : undefined} />
    </div>
    <div className="flex gap-2 flex-wrap">
      <ActionBtn label="צור הזמנת רכש" onClick={() => navigate(`/po/new?item=${id}`)} />
      <ActionBtn label="התאמת מלאי" onClick={() => {}} variant="secondary" />
      <ActionBtn label="העברה בין מחסנים" onClick={() => {}} variant="secondary" />
      <ActionBtn label="הדפס תווית" onClick={() => window.open(`/api/inventory/${id}/label`, "_blank")} variant="secondary" />
    </div>
    <RelatedTable title="מחסנים ומיקומים" rows={data.locations ?? []}
      cols={[{key:"warehouse_name",label:"מחסן"},{key:"bin_location",label:"מיקום"},
             {key:"qty",label:"כמות"},{key:"last_count_date",label:"ספירה אחרונה"}]} />
    <RelatedTable title="תנועות מלאי (30 יום)" rows={data.movements ?? []}
      cols={[{key:"movement_date",label:"תאריך"},{key:"movement_type",label:"סוג"},
             {key:"qty_change",label:"שינוי"},{key:"ref_doc",label:"מסמך"},{key:"user_name",label:"משתמש"}]} />
    <RelatedTable title="הזמנות רכש פתוחות" rows={data.open_pos ?? []}
      cols={[{key:"po_number",label:"מספר"},{key:"supplier_name",label:"ספק"},
             {key:"qty_ordered",label:"כמות"},{key:"expected_date",label:"צפוי"}]}
      onRowClick={(r) => navigate(`/po/${r.id}`)} />
    <RelatedTable title="ספקים" rows={data.suppliers ?? []}
      cols={[{key:"supplier_name",label:"ספק"},{key:"last_price",label:"מחיר אחרון"},
             {key:"lead_time_days",label:"זמן אספקה"},{key:"is_preferred",label:"מועדף"}]}
      onRowClick={(r) => navigate(`/supplier/${r.supplier_id}`)} />
    <AuditLog entries={data.audit ?? []} />
  </Page360>
);
```

## 4. Delivery360.tsx — `pages/360/Delivery360.tsx`

```tsx
const d = data.delivery ?? {};
const confirmDelivered = async () => {
  const { error: e } = await supabase.rpc("orchestrator_execute",
    { p_action: "confirm_delivery", p_entity_id: Number(id) });
  if (!e) window.location.reload();
};
const generateInvoice = async () => {
  const { data: r, error: e } = await supabase.rpc("orchestrator_execute",
    { p_action: "delivery_to_invoice", p_entity_id: Number(id) });
  if (!e && r?.invoice_id) navigate(`/finance/${r.invoice_id}`);
};
return (
  <Page360 title={`תעודת משלוח ${d.delivery_number ?? ""}`}
    subtitle={`${d.customer_name ?? ""} · ${d.delivery_date ?? ""}`} state={d.state}>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <KPI label="כתובת" value={d.delivery_address ?? "—"} />
      <KPI label="נהג" value={d.driver_name ?? "—"} />
      <KPI label="רכב" value={d.vehicle_plate ?? "—"} />
      <KPI label="חתום" value={d.signed_at ? "כן" : "לא"} color={d.signed_at ? "green" : "yellow"} />
    </div>
    <div className="flex gap-2 flex-wrap">
      <ActionBtn label="אישור משלוח" onClick={confirmDelivered} />
      <ActionBtn label="הפק חשבונית" onClick={generateInvoice} variant="secondary" />
      <ActionBtn label="הדפס תעודה" onClick={() => window.open(`/api/deliveries/${id}/print`, "_blank")} variant="secondary" />
      <ActionBtn label="צרף חתימה" onClick={() => navigate(`/signature/${id}`)} variant="secondary" />
    </div>
    <RelatedTable title="פריטים במשלוח" rows={data.line_items ?? []}
      cols={[{key:"item_code",label:"קוד"},{key:"description",label:"תיאור"},
             {key:"qty_shipped",label:"נשלח"},{key:"qty_received",label:"התקבל"},{key:"uom",label:"יח׳"}]} />
    <RelatedTable title="הזמנת לקוח" rows={data.source_order ? [data.source_order] : []}
      cols={[{key:"order_number",label:"מספר"},{key:"order_date",label:"תאריך"},{key:"grand_total",label:"סכום"}]}
      onRowClick={(r) => navigate(`/order/${r.id}`)} />
    <RelatedTable title="חשבונית מקושרת" rows={data.invoice ? [data.invoice] : []}
      cols={[{key:"invoice_number",label:"מספר"},{key:"issue_date",label:"תאריך"},
             {key:"grand_total",label:"סכום"},{key:"state",label:"סטטוס"}]}
      onRowClick={(r) => navigate(`/finance/${r.id}`)} />
    <RelatedTable title="מסמכים" rows={data.documents ?? []}
      cols={[{key:"filename",label:"קובץ"},{key:"document_type",label:"סוג"}]} />
    <AuditLog entries={data.audit ?? []} />
  </Page360>
);
```

## 5. Payment360.tsx — `pages/360/Payment360.tsx`

```tsx
const p = data.payment ?? {};
const reconcile = async () => {
  const { error: e } = await supabase.rpc("orchestrator_execute",
    { p_action: "reconcile_payment", p_entity_id: Number(id) });
  if (!e) window.location.reload();
};
return (
  <Page360 title={`תשלום ${p.payment_number ?? ""}`}
    subtitle={`${p.payer_name ?? ""} · ${p.payment_date ?? ""}`} state={p.state}>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <KPI label="סכום" value={p.amount ? `₪${Number(p.amount).toLocaleString()}` : "—"} color="green" />
      <KPI label="אמצעי" value={p.payment_method ?? "—"} />
      <KPI label="חשבון בנק" value={p.bank_account_name ?? "—"} />
      <KPI label="הותאם" value={p.is_reconciled ? "כן" : "לא"} color={p.is_reconciled ? "green" : "yellow"} />
    </div>
    <div className="flex gap-2 flex-wrap">
      <ActionBtn label="הוצא קבלה" onClick={() => window.open(`/api/payments/${id}/receipt`, "_blank")} />
      <ActionBtn label="התאם לבנק" onClick={reconcile} variant="secondary" />
      <ActionBtn label="הקצה לחשבונית" onClick={() => {}} variant="secondary" />
      <ActionBtn label="בטל תשלום" onClick={() => {}} variant="secondary" />
    </div>
    <RelatedTable title="חשבוניות שהוקצו" rows={data.allocations ?? []}
      cols={[{key:"invoice_number",label:"חשבונית"},{key:"invoice_total",label:"סך הכל"},
             {key:"allocated_amount",label:"הוקצה"},{key:"remaining_balance",label:"יתרה"}]}
      onRowClick={(r) => navigate(`/finance/${r.invoice_id}`)} />
    <RelatedTable title="פרטי המחאה / העברה" rows={p.payment_method ? [p] : []}
      cols={[{key:"check_number",label:"מס׳ המחאה"},{key:"check_date",label:"תאריך המחאה"},
             {key:"bank_name",label:"בנק מושך"},{key:"bank_branch",label:"סניף"},{key:"transaction_ref",label:"אסמכתא"}]} />
    <RelatedTable title="התאמת בנק" rows={data.bank_match ? [data.bank_match] : []}
      cols={[{key:"statement_date",label:"תאריך תדפיס"},{key:"statement_amount",label:"סכום בתדפיס"},
             {key:"match_status",label:"סטטוס"},{key:"matched_by",label:"הותאם ע״י"}]} />
    <AuditLog entries={data.audit ?? []} />
  </Page360>
);
```

## 6. Closure360.tsx — `pages/360/Closure360.tsx` (project closure / final certificate)

```tsx
const c = data.closure ?? {};
const profitColor = (c.profit_margin_pct ?? 0) >= 15 ? "green" : (c.profit_margin_pct ?? 0) >= 5 ? "yellow" : "red";
const closeProject = async () => {
  const { error: e } = await supabase.rpc("orchestrator_execute",
    { p_action: "close_project", p_entity_id: Number(id) });
  if (!e) navigate(`/project/${id}`);
};
return (
  <Page360 title={`סגירת פרויקט ${c.project_number ?? ""}`}
    subtitle={`${c.project_name ?? ""} · ${c.customer_name ?? ""}`} state={c.state}>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <KPI label="הכנסות" value={c.total_revenue ? `₪${Number(c.total_revenue).toLocaleString()}` : "—"} color="green" />
      <KPI label="עלויות" value={c.total_cost ? `₪${Number(c.total_cost).toLocaleString()}` : "—"} color="red" />
      <KPI label="רווח גולמי" value={c.gross_profit ? `₪${Number(c.gross_profit).toLocaleString()}` : "—"} />
      <KPI label="שולי רווח %" value={c.profit_margin_pct ? `${c.profit_margin_pct}%` : "—"} color={profitColor} />
    </div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <KPI label="סיום בפועל" value={c.actual_end_date ?? "—"} />
      <KPI label="ימי איחור" value={c.days_late ?? 0} color={(c.days_late ?? 0) > 0 ? "red" : "green"} />
      <KPI label="שביעות רצון" value={c.customer_satisfaction ? `${c.customer_satisfaction}/10` : "—"} />
      <KPI label="חוב פתוח" value={c.outstanding_balance ? `₪${Number(c.outstanding_balance).toLocaleString()}` : "₪0"} />
    </div>
    <div className="flex gap-2 flex-wrap">
      <ActionBtn label="סגור פרויקט סופית" onClick={closeProject} />
      <ActionBtn label="הפק תעודת סיום" onClick={() => window.open(`/api/projects/${id}/completion-cert`, "_blank")} variant="secondary" />
      <ActionBtn label="שלח שאלון לקוח" onClick={() => {}} variant="secondary" />
      <ActionBtn label="פתח מחדש" onClick={() => {}} variant="secondary" />
    </div>
    <RelatedTable title="צ'קליסט סגירה" rows={data.checklist ?? []}
      cols={[{key:"task_name",label:"משימה"},
             {key:"is_complete",label:"הושלם",render:(v:any)=>v?"כן":"לא"},
             {key:"completed_by",label:"ע״י"},{key:"completed_at",label:"תאריך"}]} />
    <RelatedTable title="כל החשבוניות" rows={data.invoices ?? []}
      cols={[{key:"invoice_number",label:"מספר"},{key:"grand_total",label:"סכום"},
             {key:"balance_due",label:"יתרה"},{key:"state",label:"סטטוס"}]}
      onRowClick={(r) => navigate(`/finance/${r.id}`)} />
    <RelatedTable title="כל התשלומים" rows={data.payments ?? []}
      cols={[{key:"payment_number",label:"מספר"},{key:"payment_date",label:"תאריך"},{key:"amount",label:"סכום"}]}
      onRowClick={(r) => navigate(`/payment/${r.id}`)} />
    <RelatedTable title="לקחים נלמדים" rows={data.lessons_learned ?? []}
      cols={[{key:"category",label:"קטגוריה"},{key:"description",label:"תיאור"},{key:"owner_name",label:"אחראי"}]} />
    <AuditLog entries={data.audit ?? []} />
  </Page360>
);
```

---

## Wire-Up — Router Registration

Add to `techno-kol-ops/client/src/App.tsx`:

```tsx
import Lead360 from "./pages/360/Lead360";
import Order360 from "./pages/360/Order360";
import InventoryItem360 from "./pages/360/InventoryItem360";
import Delivery360 from "./pages/360/Delivery360";
import Payment360 from "./pages/360/Payment360";
import Closure360 from "./pages/360/Closure360";

// Inside <Routes>:
<Route path="/lead/:id" element={<Lead360 />} />
<Route path="/order/:id" element={<Order360 />} />
<Route path="/inventory/:id" element={<InventoryItem360 />} />
<Route path="/delivery/:id" element={<Delivery360 />} />
<Route path="/payment/:id" element={<Payment360 />} />
<Route path="/project/:id/closure" element={<Closure360 />} />
```

## Backend Requirements (RPCs to ship — out of FE scope)

| RPC | Param | Returns |
|-----|-------|---------|
| `get_lead_360_fast` | `p_lead_id int` | `{lead, activities[], quotes[], documents[], audit[]}` |
| `get_order_360_fast` | `p_order_id int` | `{order, line_items[], projects[], source_quote, invoices[], audit[]}` |
| `get_inventory_item_360_fast` | `p_item_id int` | `{item, locations[], movements[], open_pos[], suppliers[], audit[]}` |
| `get_delivery_360_fast` | `p_delivery_id int` | `{delivery, line_items[], source_order, invoice, documents[], audit[]}` |
| `get_payment_360_fast` | `p_payment_id int` | `{payment, allocations[], bank_match, audit[]}` |
| `get_closure_360_fast` | `p_project_id int` | `{closure, checklist[], invoices[], payments[], lessons_learned[], audit[]}` |

Orchestrator actions: `convert_lead_to_quote`, `order_to_project`, `confirm_delivery`, `delivery_to_invoice`, `reconcile_payment`, `close_project`.

---

## Compliance Checklist (No Dead Pages Rule, per CLAUDE.md)

| # | Question | Where in scaffold |
|---|----------|-------------------|
| 1 | Where am I? | `<Page360 title=...>` header |
| 2 | What is this? | `subtitle` (entity number, customer, date) |
| 3 | Current status? | `<StatusBadge state=...>` in header (via Page360) |
| 4 | What can I do? | `<ActionBtn>` row (4 actions per page) |
| 5 | Next step? | First `ActionBtn` is the next-recommended action |
| 6 | Related records? | Multiple `<RelatedTable>` blocks with click-through |

**RTL/Hebrew:** All labels Hebrew; layout inherits `dir="rtl"` from parent shell. `text-right` already in `RelatedTable` headers (see `shared360.tsx:97`).
**Type safety:** `useParams<{id:string}>`, `Number(id)` cast, shared `<Loader>` / `<ErrCard>` covers loading/error.

## Files to Create

```
techno-kol-ops/client/src/pages/360/Lead360.tsx           (new ~50 LOC)
techno-kol-ops/client/src/pages/360/Order360.tsx          (new ~55 LOC)
techno-kol-ops/client/src/pages/360/InventoryItem360.tsx  (new ~60 LOC)
techno-kol-ops/client/src/pages/360/Delivery360.tsx       (new ~55 LOC)
techno-kol-ops/client/src/pages/360/Payment360.tsx        (new ~50 LOC)
techno-kol-ops/client/src/pages/360/Closure360.tsx        (new ~65 LOC)
techno-kol-ops/client/src/App.tsx                         (add 6 routes)
```

Total: ~340 LOC, all reuse `shared360.tsx`, no new dependencies.

## Status
- Scaffolds: complete and drop-in ready (each file = boilerplate header + body shown above)
- Pattern: matches existing `Quote360.tsx` exactly
- BE dependency: 6 RPCs + 6 orchestrator actions (flagged for backend agent)
- Next: BE ships RPCs, single PR mounts these 6 files + routes
