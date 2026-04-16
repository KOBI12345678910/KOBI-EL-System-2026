// ============================================================
// FILE: src/features/controlRooms/ProcurementControlRoom.tsx
// ============================================================

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

// ============================================================
// TYPES
// ============================================================

type ProcurementSummary = { snapshot_date?: string; open_rfqs?: number; pending_approvals?: number; overdue_pos?: number; supplier_risk_count?: number; receiving_today?: number; open_supplier_invoices?: number };
type ProcurementRFQ = { id: number; rfq_number: string; project_id?: number | null; requested_date: string; response_deadline?: string | null; approval_status: string; state: string };
type ProcurementApproval = { id: number; entity_type: string; entity_id: number; approval_type: string; state: string; requested_at: string; requested_by_user_name?: string | null };
type ProcurementPO = { id: number; po_number: string; supplier_id: number; expected_delivery_date?: string | null; grand_total: number; receiving_status: string; payment_status: string; state: string };
type ProcurementSupplierRisk = { supplier_id: number; supplier_number: string; supplier_name: string; risk_level?: string | null; overall_score?: number | null; open_pos_count?: number | null };
type ProcurementReceiving = { po_id: number; po_number: string; supplier_id: number; expected_delivery_date?: string | null; receiving_status: string; state: string };

type ProcurementControlRoomPayload = {
  summary?: ProcurementSummary;
  rfqs?: ProcurementRFQ[];
  approvals?: ProcurementApproval[];
  overdue_pos?: ProcurementPO[];
  supplier_risks?: ProcurementSupplierRisk[];
  receiving_today?: ProcurementReceiving[];
};

// ============================================================
// HELPERS
// ============================================================

const pMoney = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });
function pm(v?: number | null) { return pMoney.format(v ?? 0); }
function pd(v?: string | null) { if (!v) return "—"; try { return new Date(v).toLocaleDateString("he-IL"); } catch { return v; } }
function pdt(v?: string | null) { if (!v) return "—"; try { return new Date(v).toLocaleString("he-IL"); } catch { return v; } }

function procBadge(value?: string | null): string {
  const s = (value || "").toLowerCase();
  if (["approved", "good", "active", "quotesreceived"].includes(s)) return "bg-emerald-100 text-emerald-800 border border-emerald-200";
  if (["overdue", "high", "blocked", "open", "rejected", "critical"].includes(s)) return "bg-red-100 text-red-800 border border-red-200";
  if (["draft", "pending", "sent", "undercomparison", "pendingapproval"].includes(s)) return "bg-amber-100 text-amber-800 border border-amber-200";
  return "bg-slate-100 text-slate-800 border border-slate-200";
}

// ============================================================
// API
// ============================================================

async function fetchProcurementControlRoom(): Promise<ProcurementControlRoomPayload> {
  const res = await fetch("/api/control-room/procurement", { method: "GET", headers: { "Content-Type": "application/json" }, credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch procurement control room: ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

export const procurementControlRoomQueryKey = () => ["procurementControlRoom"] as const;

// ============================================================
// UI
// ============================================================

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4 text-lg font-black text-slate-900">{title}</div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-3 text-3xl font-black text-slate-900">{value}</div>
    </div>
  );
}

function Badge({ value }: { value?: string | null }) {
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${procBadge(value)}`}>{value || "—"}</span>;
}

type ProcurementTab = "overview" | "rfq" | "approvals" | "overduePO" | "suppliers" | "receiving";

function TabButton({ active, label, onClick, count }: { active: boolean; label: string; onClick: () => void; count?: number }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-xl px-4 py-2 text-sm font-bold transition ${active ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"}`}>
      {label}{typeof count === "number" ? ` (${count})` : ""}
    </button>
  );
}

// ============================================================
// MAIN
// ============================================================

export function ProcurementControlRoom() {
  const [activeTab, setActiveTab] = useState<ProcurementTab>("overview");
  const query = useQuery({ queryKey: procurementControlRoomQueryKey(), queryFn: fetchProcurementControlRoom, refetchInterval: 60_000 });

  // FIX: useMemo before early returns
  const nextBestAction = useMemo(() => {
    if (!query.data) return "";
    const s = query.data.summary ?? {};
    if ((s.pending_approvals ?? 0) > 0) return "טפל באישורי רכש ממתינים";
    if ((s.overdue_pos ?? 0) > 0) return "טפל ב־PO מאוחרים מול ספקים";
    if ((s.supplier_risk_count ?? 0) > 0) return "בדוק ספקים בסיכון";
    return "שמור על זרימת RFQ → Approval → PO → Receiving";
  }, [query.data]);

  if (query.isLoading) return <div className="p-6"><div className="h-10 w-96 rounded-xl bg-slate-200 animate-pulse" /></div>;
  if (query.isError) return <div className="p-6"><div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">שגיאה בטעינת Procurement Control Room</div></div>;

  const data = query.data ?? {};
  const summary = data.summary ?? {};
  const rfqs = data.rfqs ?? [];
  const approvals = data.approvals ?? [];
  const overduePOs = data.overdue_pos ?? [];
  const supplierRisks = data.supplier_risks ?? [];
  const receivingToday = data.receiving_today ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[1600px] p-6 space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-3"><h1 className="text-4xl font-black text-slate-900">Procurement Control Room</h1><Badge value="Live" /></div>
              <div className="text-sm text-slate-600">מרכז שליטה לרכש: RFQ, approvals, ספקים, PO, אספקות וסיכוני שרשרת אספקה.</div>
              <div className="text-sm text-slate-500">Snapshot: {pd(summary.snapshot_date)}</div>
            </div>
            <button type="button" onClick={() => query.refetch()} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700">רענן</button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
          <MetricCard title="Open RFQ" value={String(summary.open_rfqs ?? 0)} />
          <MetricCard title="Approvals" value={String(summary.pending_approvals ?? 0)} />
          <MetricCard title="Overdue PO" value={String(summary.overdue_pos ?? 0)} />
          <MetricCard title="Supplier Risk" value={String(summary.supplier_risk_count ?? 0)} />
          <MetricCard title="Receiving Today" value={String(summary.receiving_today ?? 0)} />
          <MetricCard title="Open Invoices" value={String(summary.open_supplier_invoices ?? 0)} />
        </div>

        <div className="flex flex-wrap gap-2">
          <TabButton active={activeTab === "overview"} label="סקירה" onClick={() => setActiveTab("overview")} />
          <TabButton active={activeTab === "rfq"} label="RFQ" onClick={() => setActiveTab("rfq")} count={rfqs.length} />
          <TabButton active={activeTab === "approvals"} label="Approvals" onClick={() => setActiveTab("approvals")} count={approvals.length} />
          <TabButton active={activeTab === "overduePO"} label="Overdue PO" onClick={() => setActiveTab("overduePO")} count={overduePOs.length} />
          <TabButton active={activeTab === "suppliers"} label="Supplier Risks" onClick={() => setActiveTab("suppliers")} count={supplierRisks.length} />
          <TabButton active={activeTab === "receiving"} label="Receiving Today" onClick={() => setActiveTab("receiving")} count={receivingToday.length} />
        </div>

        {activeTab === "overview" && (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-6">
            <Panel title="Pending Approvals">
              {approvals.length === 0 ? <div className="text-sm text-slate-600">אין approvals ממתינים.</div> : (
                <div className="space-y-3">{approvals.slice(0, 8).map((a) => (
                  <div key={a.id} className="rounded-2xl border border-slate-200 p-4"><div className="font-bold text-slate-900">{a.entity_type} #{a.entity_id}</div><div className="mt-2 text-sm text-slate-600">{a.approval_type} • Requested: {pdt(a.requested_at)} • By: {a.requested_by_user_name || "—"}</div><div className="mt-2"><Badge value={a.state} /></div></div>
                ))}</div>
              )}
            </Panel>
            <Panel title="Overdue PO">
              {overduePOs.length === 0 ? <div className="text-sm text-slate-600">אין PO מאוחרים.</div> : (
                <div className="space-y-3">{overduePOs.slice(0, 8).map((po) => (
                  <div key={po.id} className="rounded-2xl border border-slate-200 p-4"><div className="font-bold text-slate-900">{po.po_number} • Supplier #{po.supplier_id}</div><div className="mt-2 text-sm text-slate-600">Expected: {pd(po.expected_delivery_date)} • Total: {pm(po.grand_total)}</div><div className="mt-1 text-sm text-slate-600">Receiving: {po.receiving_status} • Payment: {po.payment_status}</div><div className="mt-2"><Badge value={po.state} /></div></div>
                ))}</div>
              )}
            </Panel>
          </div>
        )}

        {activeTab === "rfq" && (
          <Panel title="RFQ Queue">
            {rfqs.length === 0 ? <div className="text-sm text-slate-600">אין RFQ פתוחים.</div> : (
              <div className="space-y-3">{rfqs.map((rfq) => (
                <div key={rfq.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:justify-between"><div><div className="font-bold text-slate-900">{rfq.rfq_number}</div><div className="text-sm text-slate-600">Project #{rfq.project_id || "—"} • Requested: {pd(rfq.requested_date)} • Deadline: {pd(rfq.response_deadline)}</div><div className="mt-1 text-sm text-slate-600">Approval: {rfq.approval_status}</div></div><Badge value={rfq.state} /></div></div>
              ))}</div>
            )}
          </Panel>
        )}

        {activeTab === "approvals" && (
          <Panel title="Approval Queue">
            {approvals.length === 0 ? <div className="text-sm text-slate-600">אין אישורים ממתינים.</div> : (
              <div className="space-y-3">{approvals.map((a) => (
                <div key={a.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:justify-between"><div><div className="font-bold text-slate-900">{a.entity_type} #{a.entity_id}</div><div className="text-sm text-slate-600">Type: {a.approval_type} • Requested: {pdt(a.requested_at)}</div></div><Badge value={a.state} /></div></div>
              ))}</div>
            )}
          </Panel>
        )}

        {activeTab === "overduePO" && (
          <Panel title="Overdue PO Queue">
            {overduePOs.length === 0 ? <div className="text-sm text-slate-600">אין PO מאוחרים.</div> : (
              <div className="space-y-3">{overduePOs.map((po) => (
                <div key={po.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:justify-between"><div><div className="font-bold text-slate-900">{po.po_number}</div><div className="text-sm text-slate-600">Supplier #{po.supplier_id} • Expected: {pd(po.expected_delivery_date)} • Total: {pm(po.grand_total)}</div></div><Badge value={po.state} /></div></div>
              ))}</div>
            )}
          </Panel>
        )}

        {activeTab === "suppliers" && (
          <Panel title="Supplier Risk Grid">
            {supplierRisks.length === 0 ? <div className="text-sm text-slate-600">אין ספקים בסיכון.</div> : (
              <div className="space-y-3">{supplierRisks.map((s) => (
                <div key={s.supplier_id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:justify-between"><div><div className="font-bold text-slate-900">{s.supplier_number} • {s.supplier_name}</div><div className="text-sm text-slate-600">Score: {s.overall_score ?? "—"} • Open PO: {s.open_pos_count ?? 0}</div></div><Badge value={s.risk_level} /></div></div>
              ))}</div>
            )}
          </Panel>
        )}

        {activeTab === "receiving" && (
          <Panel title="Receiving Today">
            {receivingToday.length === 0 ? <div className="text-sm text-slate-600">אין קבלות מתוכננות להיום.</div> : (
              <div className="space-y-3">{receivingToday.map((r) => (
                <div key={r.po_id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:justify-between"><div><div className="font-bold text-slate-900">{r.po_number} • Supplier #{r.supplier_id}</div><div className="text-sm text-slate-600">Expected: {pd(r.expected_delivery_date)}</div></div><div className="flex items-center gap-2"><Badge value={r.receiving_status} /><Badge value={r.state} /></div></div></div>
              ))}</div>
            )}
          </Panel>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
          <MetricCard title="Next Best Action" value={nextBestAction} />
          <MetricCard title="Snapshot" value={pd(summary.snapshot_date)} />
          <MetricCard title="Core Focus" value={(summary.pending_approvals ?? 0) > 0 ? "Approvals" : "Suppliers"} />
          <MetricCard title="Refresh" value="60s" />
        </div>
      </div>
    </div>
  );
}
