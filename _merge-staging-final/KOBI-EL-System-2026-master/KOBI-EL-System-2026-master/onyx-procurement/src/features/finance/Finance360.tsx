// ============================================================
// FILE: src/features/finance/Finance360.tsx
// Finance Control Room — overdue invoices, reconciliation,
// collections, cash flow, dunning, payment allocations
// ============================================================

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";

// ============================================================
// TYPES
// ============================================================

type FinanceSummary = {
  total_invoiced?: number;
  total_outstanding?: number;
  total_overdue?: number;
  total_collected?: number;
  draft_invoices_count?: number;
  issued_invoices_count?: number;
  overdue_invoices_count?: number;
  paid_invoices_count?: number;
};

type OverdueInvoice = {
  id: number;
  invoice_number: string;
  customer_id: number;
  customer_name?: string;
  due_date: string;
  balance_due: number;
  state: string;
  days_overdue?: number;
};

type UnreconciledPayment = {
  id: number;
  payment_number: string;
  amount: number;
  payment_date: string;
  bank_match_status: string;
};

type ReconException = {
  id: number;
  exception_number: string;
  exception_type: string;
  severity: string;
  description: string;
  state: string;
};

type Finance360Payload = {
  summary?: FinanceSummary;
  overdue_invoices?: OverdueInvoice[];
  unreconciled_payments?: UnreconciledPayment[];
  reconciliation_exceptions?: ReconException[];
};

// ============================================================
// HELPERS
// ============================================================

const finMoney = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });
function money(v?: number | null) { return finMoney.format(v ?? 0); }
function fmtDate(v?: string | null) { if (!v) return "—"; try { return new Date(v).toLocaleDateString("he-IL"); } catch { return v; } }

function badgeClass(s?: string | null) {
  const v = (s || "").toLowerCase();
  if (["paid", "matched", "resolved", "closed"].includes(v)) return "bg-emerald-100 text-emerald-800 border border-emerald-200";
  if (["overdue", "unmatched", "high", "critical", "open"].includes(v)) return "bg-red-100 text-red-800 border border-red-200";
  return "bg-amber-100 text-amber-800 border border-amber-200";
}

// ============================================================
// API
// ============================================================

async function fetchFinance360(): Promise<Finance360Payload> {
  const res = await fetch("/api/finance/control-room", { headers: { "Content-Type": "application/json" }, credentials: "include" });
  if (!res.ok) throw new Error(`Finance 360 fetch failed: ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

export const finance360QueryKey = () => ["finance360"] as const;

// ============================================================
// UI
// ============================================================

function Badge({ value }: { value?: string | null }) {
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${badgeClass(value)}`}>{value || "—"}</span>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4"><div className="text-lg font-bold text-slate-900">{title}</div></div>
      <div className="p-5">{children}</div>
    </div>
  );
}

type FinTab = "overview" | "overdue" | "reconciliation" | "exceptions";

// ============================================================
// MAIN
// ============================================================

export function Finance360() {
  const [tab, setTab] = useState<FinTab>("overview");

  const query = useQuery({
    queryKey: finance360QueryKey(),
    queryFn: fetchFinance360,
    refetchInterval: 60_000,
  });

  if (query.isLoading) return <div className="p-6"><div className="h-10 w-96 rounded-xl bg-slate-200 animate-pulse" /></div>;
  if (query.isError) return <div className="p-6"><div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">שגיאה בטעינת Finance 360</div></div>;

  const data = query.data ?? {};
  const summary = data.summary ?? {};
  const overdue = data.overdue_invoices ?? [];
  const unreconciled = data.unreconciled_payments ?? [];
  const exceptions = data.reconciliation_exceptions ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[1400px] p-6 space-y-6">
        {/* Header */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h1 className="text-4xl font-black text-slate-900">Finance Control Room</h1>
              <div className="mt-2 text-sm text-slate-600">חדר שליטה פיננסי: חשבוניות, גבייה, התאמות בנקאיות, חריגים</div>
            </div>
            <button type="button" onClick={() => query.refetch()} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700">
              רענן
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">סה״כ מחויב</div>
            <div className="mt-3 text-3xl font-black text-slate-900">{money(summary.total_invoiced)}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">יתרה פתוחה</div>
            <div className="mt-3 text-3xl font-black text-amber-700">{money(summary.total_outstanding)}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">באיחור</div>
            <div className="mt-3 text-3xl font-black text-red-700">{money(summary.total_overdue)}</div>
            <div className="mt-1 text-sm text-slate-500">{summary.overdue_invoices_count ?? 0} חשבוניות</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">נגבה</div>
            <div className="mt-3 text-3xl font-black text-emerald-700">{money(summary.total_collected)}</div>
            <div className="mt-1 text-sm text-slate-500">{summary.paid_invoices_count ?? 0} חשבוניות</div>
          </div>
        </div>

        {/* Pipeline Bar */}
        <div className="grid grid-cols-4 gap-2">
          <div className="rounded-xl bg-slate-100 p-3 text-center text-sm">
            <div className="font-bold text-slate-900">{summary.draft_invoices_count ?? 0}</div>
            <div className="text-xs text-slate-500">Draft</div>
          </div>
          <div className="rounded-xl bg-blue-50 p-3 text-center text-sm">
            <div className="font-bold text-blue-900">{summary.issued_invoices_count ?? 0}</div>
            <div className="text-xs text-blue-600">Issued</div>
          </div>
          <div className="rounded-xl bg-red-50 p-3 text-center text-sm">
            <div className="font-bold text-red-900">{summary.overdue_invoices_count ?? 0}</div>
            <div className="text-xs text-red-600">Overdue</div>
          </div>
          <div className="rounded-xl bg-emerald-50 p-3 text-center text-sm">
            <div className="font-bold text-emerald-900">{summary.paid_invoices_count ?? 0}</div>
            <div className="text-xs text-emerald-600">Paid</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          {(["overview", "overdue", "reconciliation", "exceptions"] as FinTab[]).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-xl px-4 py-2 text-sm font-bold transition ${tab === t ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-200"}`}>
              {t === "overview" ? "סקירה" : t === "overdue" ? `חובות באיחור (${overdue.length})` : t === "reconciliation" ? `התאמות (${unreconciled.length})` : `חריגים (${exceptions.length})`}
            </button>
          ))}
        </div>

        {/* Content */}
        {tab === "overview" && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Panel title="Top 5 חובות באיחור">
              {overdue.slice(0, 5).map((inv) => (
                <div key={inv.id} className="rounded-2xl border border-slate-200 p-4 mb-3 last:mb-0 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-900">{inv.invoice_number}</div>
                    <div className="text-sm text-slate-600">{inv.customer_name || `#${inv.customer_id}`} • Due: {fmtDate(inv.due_date)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-red-700">{money(inv.balance_due)}</div>
                    <Badge value={inv.state} />
                  </div>
                </div>
              ))}
              {overdue.length === 0 && <div className="text-sm text-slate-600">אין חובות באיחור.</div>}
            </Panel>

            <Panel title="תשלומים לא מותאמים">
              {unreconciled.slice(0, 5).map((p) => (
                <div key={p.id} className="rounded-2xl border border-slate-200 p-4 mb-3 last:mb-0 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-900">{p.payment_number}</div>
                    <div className="text-sm text-slate-600">{fmtDate(p.payment_date)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{money(p.amount)}</div>
                    <Badge value={p.bank_match_status} />
                  </div>
                </div>
              ))}
              {unreconciled.length === 0 && <div className="text-sm text-slate-600">כל התשלומים מותאמים.</div>}
            </Panel>
          </div>
        )}

        {tab === "overdue" && (
          <Panel title="חשבוניות באיחור">
            {overdue.length === 0 ? <div className="text-sm text-slate-600">אין חובות באיחור.</div> : (
              <div className="space-y-3">
                {overdue.map((inv) => (
                  <div key={inv.id} className="rounded-2xl border border-slate-200 p-4 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-900">{inv.invoice_number}</div>
                      <div className="text-sm text-slate-600">{inv.customer_name || `#${inv.customer_id}`} • Due: {fmtDate(inv.due_date)} • {inv.days_overdue ?? "?"} ימים</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-red-700">{money(inv.balance_due)}</div>
                      <Badge value={inv.state} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        )}

        {tab === "reconciliation" && (
          <Panel title="תשלומים לא מותאמים">
            {unreconciled.length === 0 ? <div className="text-sm text-slate-600">הכל מותאם.</div> : (
              <div className="space-y-3">
                {unreconciled.map((p) => (
                  <div key={p.id} className="rounded-2xl border border-slate-200 p-4 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-900">{p.payment_number}</div>
                      <div className="text-sm text-slate-600">{fmtDate(p.payment_date)} • {money(p.amount)}</div>
                    </div>
                    <Badge value={p.bank_match_status} />
                  </div>
                ))}
              </div>
            )}
          </Panel>
        )}

        {tab === "exceptions" && (
          <Panel title="חריגי התאמה">
            {exceptions.length === 0 ? <div className="text-sm text-slate-600">אין חריגים.</div> : (
              <div className="space-y-3">
                {exceptions.map((e) => (
                  <div key={e.id} className="rounded-2xl border border-slate-200 p-4 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-900">{e.exception_number}</div>
                      <div className="text-sm text-slate-600">{e.exception_type} • {e.description}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge value={e.severity} />
                      <Badge value={e.state} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        )}
      </div>
    </div>
  );
}
