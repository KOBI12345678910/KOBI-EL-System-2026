// ============================================================
// Payment360 — Finance domain 360° page
// Hebrew RTL, allocation interface (link to invoices), reconcile, refund.
// API: /api/v2/finance/payments/*
// ============================================================
import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";

const API_BASE = "/api/v2/finance";

type Payment = {
  id: number;
  payment_number: string;
  invoice_id: number;
  customer_id: number | null;
  supplier_id: number | null;
  payment_date: string;
  payment_method: string | null;
  amount: number | string;
  currency: string | null;
  reference_number: string | null;
  bank_match_status: string | null;
  gl_status: string | null;
  state: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type Allocation = {
  id: number;
  payment_id: number;
  invoice_id: number;
  amount: number | string;
  currency: string | null;
  allocated_at: string;
  state: string;
  notes: string | null;
};

function num(x: number | string | null | undefined): number {
  const n = Number(x ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function fmtILS(n: number | string | null | undefined, currency = "ILS"): string {
  if (n == null) return "—";
  try {
    return new Intl.NumberFormat("he-IL", {
      style: "currency", currency, maximumFractionDigits: 2,
    }).format(num(n));
  } catch { return num(n).toFixed(2); }
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("he-IL"); } catch { return s; }
}

const STATE_LABEL: Record<string, string> = {
  pending: "ממתין",
  cleared: "נוקה",
  reconciled: "הותאם",
  failed: "נכשל",
  refunded: "הוחזר",
  Posted: "נרשם",
};

const STATE_TONE: Record<string, string> = {
  pending: "bg-yellow-200 text-yellow-900",
  cleared: "bg-blue-200 text-blue-900",
  reconciled: "bg-emerald-200 text-emerald-900",
  failed: "bg-red-200 text-red-900",
  refunded: "bg-gray-300 text-gray-900",
  Posted: "bg-indigo-200 text-indigo-900",
};

async function apiGet<T>(path: string): Promise<T> {
  const r = await authFetch(API_BASE + path);
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
  return r.json() as Promise<T>;
}
async function apiSend<T>(method: "POST" | "PATCH" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
  const r = await authFetch(API_BASE + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => r.statusText);
    throw new Error(`${method} ${path} → ${r.status}: ${txt}`);
  }
  return r.status === 204 ? ({} as T) : (r.json() as Promise<T>);
}

export default function Payment360() {
  const [, params] = useRoute<{ id: string }>("/payments/:id");
  const id = params?.id;
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const paymentQ = useQuery<Payment>({
    queryKey: ["finance", "payment", id],
    queryFn: () => apiGet<Payment>(`/payments/${id}`),
    enabled: !!id,
  });
  const allocsQ = useQuery<{ rows: Allocation[] }>({
    queryKey: ["finance", "payment-allocations", id],
    queryFn: () => apiGet<{ rows: Allocation[] }>(`/payments/${id}/allocations`),
    enabled: !!id,
  });

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["finance", "payment", id] }),
      qc.invalidateQueries({ queryKey: ["finance", "payment-allocations", id] }),
    ]);
  }

  async function handleReconcile() {
    if (!confirm("לאשר התאמה בנקאית?")) return;
    setBusy(true);
    try {
      await apiSend("POST", `/payments/${id}/reconcile`, {});
      await refresh();
    } catch (e) { alert((e as Error).message); } finally { setBusy(false); }
  }

  async function handleRefund() {
    const amtStr = prompt("סכום לזיכוי:");
    if (!amtStr) return;
    const refund_amount = Number(amtStr);
    if (!(refund_amount > 0)) { alert("סכום לא חוקי"); return; }
    const reason = prompt("סיבת הזיכוי:") ?? "";
    if (reason.length < 3) { alert("חובה לציין סיבה"); return; }
    setBusy(true);
    try {
      await apiSend("POST", `/payments/${id}/refund`, { refund_amount, reason });
      await refresh();
    } catch (e) { alert((e as Error).message); } finally { setBusy(false); }
  }

  if (paymentQ.isLoading) return <div dir="rtl" className="p-6 text-gray-500">טוען…</div>;
  if (paymentQ.error)     return <div dir="rtl" className="p-6 text-red-700 bg-red-50 rounded">שגיאה: {(paymentQ.error as Error).message}</div>;
  const p = paymentQ.data;
  if (!p)                 return <div dir="rtl" className="p-6 text-gray-500">תשלום לא נמצא</div>;
  const allocs = allocsQ.data?.rows ?? [];
  const totalAllocated = allocs.reduce((s, a) => s + num(a.amount), 0);
  const remaining = Math.max(0, num(p.amount) - totalAllocated);
  const currency = p.currency ?? "ILS";
  const canReconcile = ["pending", "cleared", "Posted"].includes(p.state);
  const canRefund = ["pending", "cleared", "reconciled", "Posted"].includes(p.state);
  const canAllocate = remaining > 0.01 && p.state !== "refunded";

  return (
    <div dir="rtl" className="p-6 space-y-6" style={{ direction: "rtl" }}>
      <header className="flex items-start justify-between gap-4 border-b pb-4">
        <div>
          <div className="text-sm text-gray-500">תשלום #{p.payment_number}</div>
          <h1 className="text-3xl font-semibold">{fmtILS(p.amount, currency)}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATE_TONE[p.state] ?? "bg-gray-100 text-gray-800"}`}>
              {STATE_LABEL[p.state] ?? p.state}
            </span>
            <span>אמצעי: {p.payment_method ?? "—"}</span>
            <span>תאריך: {fmtDate(p.payment_date)}</span>
            {p.reference_number && <span>אסמכתא: {p.reference_number}</span>}
            {p.customer_id && <span>לקוח #{p.customer_id}</span>}
            {p.supplier_id && <span>ספק #{p.supplier_id}</span>}
          </div>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex gap-2">
            {canReconcile && (
              <button onClick={handleReconcile} disabled={busy} className="rounded bg-emerald-600 px-3 py-1.5 text-white disabled:opacity-60">
                התאמה בנקאית
              </button>
            )}
            {canRefund && (
              <button onClick={handleRefund} disabled={busy} className="rounded bg-red-600 px-3 py-1.5 text-white disabled:opacity-60">
                זיכוי
              </button>
            )}
          </div>
          <Link href="/payments" className="rounded border px-3 py-1.5 text-center">חזרה לרשימה</Link>
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="סכום תשלום" value={fmtILS(p.amount, currency)} />
        <Kpi label="סה״כ מוקצה" value={fmtILS(totalAllocated, currency)} />
        <Kpi label="יתרה להקצאה" value={fmtILS(remaining, currency)} tone={remaining > 0.01 ? "warn" : "ok"} />
        <Kpi label="סטטוס בנק" value={p.bank_match_status ?? "—"} />
      </section>

      {/* ═══════ ALLOCATIONS ═══════ */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">הקצאות לחשבוניות</h2>
          <span className="text-xs text-gray-500">
            חשבונית ראשית מקושרת: <Link href={`/invoices/${p.invoice_id}`} className="text-indigo-700 underline">#{p.invoice_id}</Link>
          </span>
        </div>
        <AllocationsPanel
          paymentId={p.id}
          allocations={allocs}
          remaining={remaining}
          currency={currency}
          canAllocate={canAllocate}
          onChanged={refresh}
        />
      </section>

      {/* ═══════ STATUS TIMELINE ═══════ */}
      <section>
        <h2 className="text-lg font-semibold mb-2">מעקב</h2>
        <ul className="text-sm space-y-1 rounded border bg-white p-4">
          <li><b>נוצר:</b> {fmtDate(p.created_at)}</li>
          <li><b>תאריך תשלום:</b> {fmtDate(p.payment_date)}</li>
          {p.bank_match_status && <li><b>סטטוס התאמה:</b> {p.bank_match_status}</li>}
          <li><b>עדכון אחרון:</b> {fmtDate(p.updated_at)}</li>
        </ul>
      </section>

      {p.notes && (
        <section>
          <h2 className="text-lg font-semibold mb-2">הערות</h2>
          <div className="rounded border bg-yellow-50 p-3 text-sm whitespace-pre-wrap">{p.notes}</div>
        </section>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  const toneCls = tone === "warn" ? "bg-red-50 border-red-200" : tone === "ok" ? "bg-emerald-50 border-emerald-200" : "bg-white";
  return (
    <div className={`rounded border p-4 ${toneCls}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Allocations panel — add new allocation(s)
// ════════════════════════════════════════════════════════════
function AllocationsPanel({
  paymentId, allocations, remaining, currency, canAllocate, onChanged,
}: {
  paymentId: number;
  allocations: Allocation[];
  remaining: number;
  currency: string;
  canAllocate: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [newInvoiceId, setNewInvoiceId] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    const invoice_id = Number(newInvoiceId);
    const amount = Number(newAmount);
    if (!Number.isInteger(invoice_id) || invoice_id <= 0) { alert("מזהה חשבונית לא חוקי"); return; }
    if (!(amount > 0)) { alert("סכום לא חוקי"); return; }
    if (amount > remaining + 0.01) { alert(`חורג מהיתרה (${remaining.toFixed(2)})`); return; }
    setBusy(true);
    try {
      await apiSend("POST", `/payments/${paymentId}/allocate`, {
        allocations: [{ invoice_id, amount }],
      });
      setNewInvoiceId("");
      setNewAmount("");
      await onChanged();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded border bg-white">
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-right">#</th>
              <th className="p-2 text-right">חשבונית</th>
              <th className="p-2 text-right">סכום</th>
              <th className="p-2 text-right">מטבע</th>
              <th className="p-2 text-right">תאריך הקצאה</th>
              <th className="p-2 text-right">סטטוס</th>
              <th className="p-2 text-right">הערות</th>
            </tr>
          </thead>
          <tbody>
            {allocations.length === 0 && (
              <tr><td colSpan={7} className="p-4 text-center text-gray-500">אין הקצאות עדיין</td></tr>
            )}
            {allocations.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="p-2">{a.id}</td>
                <td className="p-2">
                  <Link href={`/invoices/${a.invoice_id}`} className="text-indigo-700 underline">#{a.invoice_id}</Link>
                </td>
                <td className="p-2 font-semibold">{fmtILS(a.amount, a.currency ?? currency)}</td>
                <td className="p-2">{a.currency ?? currency}</td>
                <td className="p-2">{fmtDate(a.allocated_at)}</td>
                <td className="p-2">{a.state}</td>
                <td className="p-2 text-gray-500">{a.notes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canAllocate && (
        <div className="flex flex-wrap items-end gap-2 p-3 border-t">
          <div>
            <label className="block text-xs text-gray-500 mb-1">מזהה חשבונית</label>
            <input type="number" value={newInvoiceId} onChange={(e) => setNewInvoiceId(e.target.value)}
              className="w-32 border rounded px-2 py-1 text-right" placeholder="#" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">סכום ({currency})</label>
            <input type="number" step="0.01" value={newAmount} onChange={(e) => setNewAmount(e.target.value)}
              className="w-32 border rounded px-2 py-1 text-right" placeholder="0.00" />
          </div>
          <button onClick={add} disabled={busy} className="rounded bg-indigo-600 px-4 py-1.5 text-white text-sm disabled:opacity-60">
            {busy ? "שולח…" : "+ הקצה"}
          </button>
          <span className="text-xs text-gray-500">יתרה: {fmtILS(remaining, currency)}</span>
        </div>
      )}
    </div>
  );
}
