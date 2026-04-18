import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

type FinanceSummary = {
  snapshot_date?: string;
  ar_total?: number;
  ap_total?: number;
  overdue_amount?: number;
  unreconciled_payments_count?: number;
  vat_liability?: number;
  cashflow_position?: number;
  open_customer_invoices_count?: number;
  open_supplier_invoices_count?: number;
};

type CustomerInvoiceRow = {
  id: number;
  invoice_number: string;
  customer_id?: number | null;
  issue_date?: string | null;
  due_date?: string | null;
  grand_total?: number | null;
  balance_due?: number | null;
  state: string;
};

type SupplierInvoiceRow = {
  id: number;
  supplier_invoice_number: string;
  supplier_id?: number | null;
  invoice_date?: string | null;
  due_date?: string | null;
  grand_total?: number | null;
  balance_due?: number | null;
  state: string;
};

type PaymentRow = {
  id: number;
  payment_number: string;
  customer_id?: number | null;
  amount?: number | null;
  payment_date?: string | null;
  bank_match_status?: string | null;
};

type FinancePayload = {
  summary?: FinanceSummary;
  customer_invoices?: CustomerInvoiceRow[];
  supplier_invoices?: SupplierInvoiceRow[];
  payments?: PaymentRow[];
};

const money = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

function m(v?: number | null) {
  return money.format(v ?? 0);
}

function formatDate(value?: string | null): string {
  if (!value) return "\u2014";
  try {
    return new Date(value).toLocaleDateString("he-IL");
  } catch {
    return value;
  }
}

function badgeClass(value?: string | null): string {
  const s = (value || "").toLowerCase();
  if (["paid", "matched", "closed"].includes(s)) return "bg-emerald-100 text-emerald-800 border border-emerald-200";
  if (["overdue", "unmatched", "open"].includes(s)) return "bg-red-100 text-red-800 border border-red-200";
  if (["issued", "partiallypaid", "pending"].includes(s)) return "bg-amber-100 text-amber-800 border border-amber-200";
  return "bg-slate-100 text-slate-800 border border-slate-200";
}

function Badge({ value }: { value?: string | null }) {
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${badgeClass(value)}`}>{value || "\u2014"}</span>;
}

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

type FinanceTab = "overview" | "customerInvoices" | "supplierInvoices" | "payments";

function TabButton({
  active,
  label,
  onClick,
  count,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
        active ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
      }`}
    >
      {label}
      {typeof count === "number" ? ` (${count})` : ""}
    </button>
  );
}

async function fetchFinanceControlRoom(): Promise<FinancePayload> {
  const res = await fetch("/api/control-room/finance", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Failed to fetch finance control room: ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

export const financeControlRoomQueryKey = () => ["financeControlRoom"] as const;

export default function FinanceControlRoom() {
  const [tab, setTab] = useState<FinanceTab>("overview");

  const query = useQuery({
    queryKey: financeControlRoomQueryKey(),
    queryFn: fetchFinanceControlRoom,
    refetchInterval: 60_000,
  });

  if (query.isLoading) return <div className="p-6 text-white">Loading finance control room...</div>;

  if (query.isError) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
          \u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D8\u05E2\u05D9\u05E0\u05EA Finance Control Room
        </div>
      </div>
    );
  }

  const data = query.data ?? {};
  const summary = data.summary ?? {};
  const customerInvoices = data.customer_invoices ?? [];
  const supplierInvoices = data.supplier_invoices ?? [];
  const payments = data.payments ?? [];

  const nextBestAction = useMemo(() => {
    if ((summary.overdue_amount ?? 0) > 0) return "\u05D8\u05E4\u05DC \u05D1\u05DC\u05E7\u05D5\u05D7\u05D5\u05EA \u05D1\u05E4\u05D9\u05D2\u05D5\u05E8";
    if ((summary.unreconciled_payments_count ?? 0) > 0) return "\u05D1\u05E6\u05E2 \u05D4\u05EA\u05D0\u05DE\u05D5\u05EA \u05D1\u05E0\u05E7";
    if ((summary.open_supplier_invoices_count ?? 0) > 0) return "\u05D1\u05D3\u05D5\u05E7 \u05D7\u05E9\u05D1\u05D5\u05E0\u05D9\u05D5\u05EA \u05E1\u05E4\u05E7 \u05E4\u05EA\u05D5\u05D7\u05D5\u05EA";
    return "\u05D4\u05DE\u05E6\u05D1 \u05D4\u05E4\u05D9\u05E0\u05E0\u05E1\u05D9 \u05D9\u05E6\u05D9\u05D1";
  }, [summary]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[1600px] p-6 space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-4xl font-black text-slate-900">Finance Control Room</h1>
              <div className="mt-2 text-sm text-slate-600">
                \u05DE\u05E8\u05DB\u05D6 \u05E9\u05DC\u05D9\u05D8\u05D4 \u05E4\u05D9\u05E0\u05E0\u05E1\u05D9: AR, AP, overdue, VAT, payments, reconciliation, supplier invoices.
              </div>
              <div className="mt-2 text-sm text-slate-500">Snapshot: {formatDate(summary.snapshot_date)}</div>
            </div>
            <button
              type="button"
              onClick={() => query.refetch()}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700"
            >
              \u05E8\u05E2\u05E0\u05DF
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-8 gap-4">
          <MetricCard title="AR" value={m(summary.ar_total)} />
          <MetricCard title="AP" value={m(summary.ap_total)} />
          <MetricCard title="Overdue" value={m(summary.overdue_amount)} />
          <MetricCard title="Unreconciled" value={String(summary.unreconciled_payments_count ?? 0)} />
          <MetricCard title="VAT" value={m(summary.vat_liability)} />
          <MetricCard title="Cashflow" value={m(summary.cashflow_position)} />
          <MetricCard title="Cust Invoices" value={String(summary.open_customer_invoices_count ?? 0)} />
          <MetricCard title="Supp Invoices" value={String(summary.open_supplier_invoices_count ?? 0)} />
        </div>

        <div className="flex flex-wrap gap-2">
          <TabButton active={tab === "overview"} label="\u05E1\u05E7\u05D9\u05E8\u05D4" onClick={() => setTab("overview")} />
          <TabButton active={tab === "customerInvoices"} label="Customer Invoices" onClick={() => setTab("customerInvoices")} count={customerInvoices.length} />
          <TabButton active={tab === "supplierInvoices"} label="Supplier Invoices" onClick={() => setTab("supplierInvoices")} count={supplierInvoices.length} />
          <TabButton active={tab === "payments"} label="Payments" onClick={() => setTab("payments")} count={payments.length} />
        </div>

        {tab === "overview" && (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-6">
            <Panel title="Overdue Customer Invoices">
              <div className="space-y-3">
                {customerInvoices.filter((i) => (i.state || "").toLowerCase() === "overdue").slice(0, 10).map((i) => (
                  <div key={i.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-bold text-slate-900">{i.invoice_number}</div>
                        <div className="mt-2 text-sm text-slate-600">
                          Customer #{i.customer_id || "\u2014"} &bull; Due: {formatDate(i.due_date)} &bull; Balance: {m(i.balance_due)}
                        </div>
                      </div>
                      <Badge value={i.state} />
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Unmatched Payments">
              <div className="space-y-3">
                {payments.filter((p) => (p.bank_match_status || "").toLowerCase() !== "matched").slice(0, 10).map((p) => (
                  <div key={p.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-bold text-slate-900">{p.payment_number}</div>
                        <div className="mt-2 text-sm text-slate-600">
                          Customer #{p.customer_id || "\u2014"} &bull; Date: {formatDate(p.payment_date)} &bull; Amount: {m(p.amount)}
                        </div>
                      </div>
                      <Badge value={p.bank_match_status} />
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        )}

        {tab === "customerInvoices" && (
          <Panel title="Customer Invoices">
            <div className="space-y-3">
              {customerInvoices.map((i) => (
                <div key={i.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-bold text-slate-900">{i.invoice_number}</div>
                      <div className="mt-2 text-sm text-slate-600">
                        Customer #{i.customer_id || "\u2014"} &bull; Issue: {formatDate(i.issue_date)} &bull; Due: {formatDate(i.due_date)}
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        Total: {m(i.grand_total)} &bull; Balance: {m(i.balance_due)}
                      </div>
                    </div>
                    <Badge value={i.state} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {tab === "supplierInvoices" && (
          <Panel title="Supplier Invoices">
            <div className="space-y-3">
              {supplierInvoices.map((i) => (
                <div key={i.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-bold text-slate-900">{i.supplier_invoice_number}</div>
                      <div className="mt-2 text-sm text-slate-600">
                        Supplier #{i.supplier_id || "\u2014"} &bull; Invoice: {formatDate(i.invoice_date)} &bull; Due: {formatDate(i.due_date)}
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        Total: {m(i.grand_total)} &bull; Balance: {m(i.balance_due)}
                      </div>
                    </div>
                    <Badge value={i.state} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {tab === "payments" && (
          <Panel title="Payments">
            <div className="space-y-3">
              {payments.map((p) => (
                <div key={p.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-bold text-slate-900">{p.payment_number}</div>
                      <div className="mt-2 text-sm text-slate-600">
                        Customer #{p.customer_id || "\u2014"} &bull; Date: {formatDate(p.payment_date)} &bull; Amount: {m(p.amount)}
                      </div>
                    </div>
                    <Badge value={p.bank_match_status} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
          <MetricCard title="Next Best Action" value={nextBestAction} />
          <MetricCard title="Snapshot" value={formatDate(summary.snapshot_date)} />
          <MetricCard title="Focus" value={(summary.overdue_amount ?? 0) > 0 ? "Collections" : "Reconciliation"} />
          <MetricCard title="Refresh" value="60s" />
        </div>
      </div>
    </div>
  );
}
