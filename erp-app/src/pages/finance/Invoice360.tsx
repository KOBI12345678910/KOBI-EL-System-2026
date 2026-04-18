// ============================================================
// Invoice360 — Finance domain 360° page
// Hebrew RTL, embedded invoice-lines editor, actions: issue/void.
// API: /api/v2/finance/invoices/*
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";

const API_BASE = "/api/v2/finance";

type Invoice = {
  id: number;
  invoice_number: string;
  invoice_type: string;
  customer_id: number | null;
  supplier_id: number | null;
  project_id: number | null;
  po_id: number | null;
  issue_date: string | null;
  due_date: string | null;
  subtotal: number | string;
  discount_total: number | string;
  vat_total: number | string;
  grand_total: number | string;
  paid_total: number | string;
  balance_due: number | string;
  currency: string | null;
  state: string;
  sent_at: string | null;
  cancelled_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type InvoiceLine = {
  id: number;
  invoice_id: number;
  line_number: number;
  description: string;
  quantity: number | string;
  unit_price: number | string;
  discount_percent: number | string;
  line_subtotal: number | string;
  vat_percent: number | string;
  vat_amount: number | string;
  line_total: number | string;
  notes?: string | null;
};

function num(x: number | string | null | undefined): number {
  const n = Number(x ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function fmtILS(n: number | string | null | undefined, currency = "ILS"): string {
  if (n == null) return "—";
  try {
    return new Intl.NumberFormat("he-IL", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(num(n));
  } catch {
    return num(n).toFixed(2);
  }
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("he-IL"); } catch { return s; }
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

function computeLineTotals(l: {
  quantity: number; unit_price: number; discount_percent: number; vat_percent: number;
}): { line_subtotal: number; vat_amount: number; line_total: number } {
  const subtotal = round2(l.quantity * l.unit_price * (1 - (l.discount_percent ?? 0) / 100));
  const vat = round2(subtotal * ((l.vat_percent ?? 0) / 100));
  return { line_subtotal: subtotal, vat_amount: vat, line_total: round2(subtotal + vat) };
}

const STATE_LABEL: Record<string, string> = {
  draft: "טיוטה",
  issued: "הונפקה",
  sent: "נשלחה",
  partially_paid: "שולמה חלקית",
  paid: "שולמה",
  overdue: "באיחור",
  cancelled: "בוטלה",
  voided: "מבוטלת",
};

const STATE_TONE: Record<string, string> = {
  draft: "bg-gray-200 text-gray-800",
  issued: "bg-blue-200 text-blue-900",
  sent: "bg-indigo-200 text-indigo-900",
  partially_paid: "bg-amber-200 text-amber-900",
  paid: "bg-emerald-200 text-emerald-900",
  overdue: "bg-red-200 text-red-900",
  cancelled: "bg-gray-300 text-gray-900",
  voided: "bg-red-300 text-red-900",
};

// ────────────────────────────────────────────────────────────
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

// ────────────────────────────────────────────────────────────
export default function Invoice360() {
  const [, params] = useRoute<{ id: string }>("/invoices/:id");
  const id = params?.id;
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const invoiceQ = useQuery<Invoice>({
    queryKey: ["finance", "invoice", id],
    queryFn: () => apiGet<Invoice>(`/invoices/${id}`),
    enabled: !!id,
  });
  const linesQ = useQuery<{ rows: InvoiceLine[] }>({
    queryKey: ["finance", "invoice-lines", id],
    queryFn: () => apiGet<{ rows: InvoiceLine[] }>(`/invoices/${id}/lines`),
    enabled: !!id,
  });

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["finance", "invoice", id] }),
      qc.invalidateQueries({ queryKey: ["finance", "invoice-lines", id] }),
    ]);
  }

  async function handleIssue() {
    if (!confirm("להנפיק את החשבונית?")) return;
    setBusy(true);
    try {
      await apiSend("POST", `/invoices/${id}/issue`, { send_to_customer: false });
      await refresh();
    } catch (e) { alert((e as Error).message); } finally { setBusy(false); }
  }
  async function handleSend() {
    if (!confirm("לשלוח את החשבונית ללקוח?")) return;
    setBusy(true);
    try {
      await apiSend("POST", `/invoices/${id}/issue`, { send_to_customer: true });
      await refresh();
    } catch (e) { alert((e as Error).message); } finally { setBusy(false); }
  }
  async function handleVoid() {
    const reason = prompt("סיבת ביטול:");
    if (!reason || reason.length < 3) return;
    setBusy(true);
    try {
      await apiSend("POST", `/invoices/${id}/void`, { reason });
      await refresh();
    } catch (e) { alert((e as Error).message); } finally { setBusy(false); }
  }

  if (invoiceQ.isLoading) return <div dir="rtl" className="p-6 text-gray-500">טוען…</div>;
  if (invoiceQ.error)     return <div dir="rtl" className="p-6 text-red-700 bg-red-50 rounded">שגיאה: {(invoiceQ.error as Error).message}</div>;
  const invoice = invoiceQ.data;
  if (!invoice)           return <div dir="rtl" className="p-6 text-gray-500">החשבונית לא נמצאה</div>;
  const lines = linesQ.data?.rows ?? [];

  const currency = invoice.currency ?? "ILS";
  const canEditLines = invoice.state === "draft";
  const canIssue = invoice.state === "draft";
  const canVoid = !["draft", "cancelled", "voided"].includes(invoice.state);

  return (
    <div dir="rtl" className="p-6 space-y-6" style={{ direction: "rtl" }}>
      {/* ═══════ HEADER ═══════ */}
      <header className="flex items-start justify-between gap-4 border-b pb-4">
        <div>
          <div className="text-sm text-gray-500">חשבונית #{invoice.invoice_number}</div>
          <h1 className="text-3xl font-semibold">{fmtILS(invoice.grand_total, currency)}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATE_TONE[invoice.state] ?? "bg-gray-100 text-gray-800"}`}>
              {STATE_LABEL[invoice.state] ?? invoice.state}
            </span>
            <span>סוג: {invoice.invoice_type}</span>
            <span>הונפקה: {fmtDate(invoice.issue_date)}</span>
            <span>תאריך פירעון: {fmtDate(invoice.due_date)}</span>
            {invoice.customer_id && <span>לקוח #{invoice.customer_id}</span>}
            {invoice.supplier_id && <span>ספק #{invoice.supplier_id}</span>}
            {invoice.project_id && <span>פרויקט #{invoice.project_id}</span>}
          </div>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex gap-2">
            {canIssue && (
              <button onClick={handleIssue} disabled={busy} className="rounded bg-emerald-600 px-3 py-1.5 text-white disabled:opacity-60">
                הנפק
              </button>
            )}
            {canIssue && (
              <button onClick={handleSend} disabled={busy} className="rounded bg-indigo-600 px-3 py-1.5 text-white disabled:opacity-60">
                הנפק ושלח
              </button>
            )}
            {canVoid && (
              <button onClick={handleVoid} disabled={busy} className="rounded bg-red-600 px-3 py-1.5 text-white disabled:opacity-60">
                בטל חשבונית
              </button>
            )}
          </div>
          <Link href="/invoices" className="rounded border px-3 py-1.5 text-center">חזרה לרשימה</Link>
        </div>
      </header>

      {/* ═══════ KPIs ═══════ */}
      <section className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Kpi label="סה״כ לפני מע״מ" value={fmtILS(invoice.subtotal, currency)} />
        <Kpi label="הנחה" value={fmtILS(invoice.discount_total, currency)} />
        <Kpi label="מע״מ" value={fmtILS(invoice.vat_total, currency)} />
        <Kpi label="סה״כ כולל מע״מ" value={fmtILS(invoice.grand_total, currency)} />
        <Kpi label="שולם" value={fmtILS(invoice.paid_total, currency)} />
        <Kpi label="יתרה לתשלום" value={fmtILS(invoice.balance_due, currency)} tone={num(invoice.balance_due) > 0 ? "warn" : "ok"} />
      </section>

      {/* ═══════ LINES EDITOR ═══════ */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">שורות חשבונית</h2>
          <span className="text-xs text-gray-500">
            {canEditLines ? "ניתן לערוך רק בסטטוס טיוטה" : "שורות נעולות — לא ניתן לערוך בסטטוס זה"}
          </span>
        </div>
        <InvoiceLinesEditor
          invoiceId={invoice.id}
          lines={lines}
          editable={canEditLines}
          currency={currency}
          onChanged={refresh}
        />
      </section>

      {/* ═══════ STATUS TIMELINE ═══════ */}
      <section>
        <h2 className="text-lg font-semibold mb-2">מצב ומעקב</h2>
        <ul className="text-sm space-y-1 rounded border bg-white p-4">
          <li><b>נוצרה:</b> {fmtDate(invoice.created_at)}</li>
          {invoice.issue_date && <li><b>הונפקה:</b> {fmtDate(invoice.issue_date)}</li>}
          {invoice.sent_at && <li><b>נשלחה ללקוח:</b> {fmtDate(invoice.sent_at)}</li>}
          {invoice.cancelled_at && <li className="text-red-700"><b>בוטלה:</b> {fmtDate(invoice.cancelled_at)}</li>}
          <li><b>עדכון אחרון:</b> {fmtDate(invoice.updated_at)}</li>
        </ul>
      </section>

      {/* ═══════ NOTES ═══════ */}
      {invoice.notes && (
        <section>
          <h2 className="text-lg font-semibold mb-2">הערות</h2>
          <div className="rounded border bg-yellow-50 p-3 text-sm whitespace-pre-wrap">
            {invoice.notes}
          </div>
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
// Embedded lines editor
// ════════════════════════════════════════════════════════════
type DraftLine = {
  id?: number;
  line_number: number;
  description: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  vat_percent: number;
  _dirty?: boolean;
};

function toDraft(l: InvoiceLine): DraftLine {
  return {
    id: l.id,
    line_number: Number(l.line_number),
    description: l.description,
    quantity: num(l.quantity),
    unit_price: num(l.unit_price),
    discount_percent: num(l.discount_percent),
    vat_percent: num(l.vat_percent),
  };
}

function InvoiceLinesEditor({
  invoiceId, lines, editable, currency, onChanged,
}: {
  invoiceId: number;
  lines: InvoiceLine[];
  editable: boolean;
  currency: string;
  onChanged: () => Promise<void> | void;
}) {
  const [draft, setDraft] = useState<DraftLine[]>(() => lines.map(toDraft));
  const [busy, setBusy] = useState(false);

  // Sync if upstream refreshes
  const linesKey = lines.map((l) => `${l.id}:${l.line_number}`).join("|");
  useMemoSync(linesKey, () => setDraft(lines.map(toDraft)));

  const totals = useMemo(() => {
    let subtotal = 0, vat = 0, total = 0;
    for (const l of draft) {
      const t = computeLineTotals(l);
      subtotal += t.line_subtotal;
      vat += t.vat_amount;
      total += t.line_total;
    }
    return { subtotal: round2(subtotal), vat: round2(vat), total: round2(total) };
  }, [draft]);

  function updateRow(i: number, patch: Partial<DraftLine>) {
    setDraft((prev) => prev.map((r, idx) => idx === i ? { ...r, ...patch, _dirty: true } : r));
  }
  function addRow() {
    setDraft((prev) => [
      ...prev,
      {
        line_number: (prev[prev.length - 1]?.line_number ?? 0) + 1,
        description: "",
        quantity: 1,
        unit_price: 0,
        discount_percent: 0,
        vat_percent: 18,
        _dirty: true,
      },
    ]);
  }
  function removeRow(i: number) {
    setDraft((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function saveAll() {
    if (!editable) return;
    if (draft.length === 0) { alert("חייבת להיות לפחות שורה אחת"); return; }
    for (const l of draft) {
      if (!l.description?.trim()) { alert(`שורה ${l.line_number}: חסר תיאור`); return; }
      if (l.quantity <= 0)        { alert(`שורה ${l.line_number}: כמות חייבת להיות חיובית`); return; }
      if (l.unit_price < 0)       { alert(`שורה ${l.line_number}: מחיר יחידה לא יכול להיות שלילי`); return; }
    }
    setBusy(true);
    try {
      const payload = {
        invoice_id: invoiceId,
        lines: draft.map((l) => {
          const t = computeLineTotals(l);
          return {
            invoice_id: invoiceId,
            line_number: l.line_number,
            description: l.description,
            quantity: l.quantity,
            unit_price: l.unit_price,
            discount_percent: l.discount_percent,
            vat_percent: l.vat_percent,
            line_subtotal: t.line_subtotal,
            vat_amount: t.vat_amount,
            line_total: t.line_total,
          };
        }),
      };
      await apiSend("PUT", `/invoices/${invoiceId}/lines`, payload);
      await onChanged();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!editable && draft.length === 0) {
    return <div className="rounded border p-4 text-center text-sm text-gray-500">אין שורות</div>;
  }

  return (
    <div className="rounded border bg-white">
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-right">#</th>
              <th className="p-2 text-right">תיאור</th>
              <th className="p-2 text-right">כמות</th>
              <th className="p-2 text-right">מחיר יח'</th>
              <th className="p-2 text-right">הנחה %</th>
              <th className="p-2 text-right">מע״מ %</th>
              <th className="p-2 text-right">סה״כ לפני מע״מ</th>
              <th className="p-2 text-right">מע״מ</th>
              <th className="p-2 text-right">סה״כ כולל מע״מ</th>
              {editable && <th className="p-2 text-right"></th>}
            </tr>
          </thead>
          <tbody>
            {draft.map((l, i) => {
              const t = computeLineTotals(l);
              return (
                <tr key={`${l.id ?? "new"}-${i}`} className="border-t">
                  <td className="p-2">
                    {editable ? (
                      <input type="number" min={1} value={l.line_number} onChange={(e) => updateRow(i, { line_number: Number(e.target.value) })}
                        className="w-16 border rounded px-2 py-1 text-right" />
                    ) : l.line_number}
                  </td>
                  <td className="p-2">
                    {editable ? (
                      <input value={l.description} onChange={(e) => updateRow(i, { description: e.target.value })}
                        className="w-full min-w-[180px] border rounded px-2 py-1 text-right" />
                    ) : l.description}
                  </td>
                  <td className="p-2">
                    {editable ? (
                      <input type="number" step="0.01" value={l.quantity} onChange={(e) => updateRow(i, { quantity: Number(e.target.value) })}
                        className="w-20 border rounded px-2 py-1 text-right" />
                    ) : l.quantity}
                  </td>
                  <td className="p-2">
                    {editable ? (
                      <input type="number" step="0.01" value={l.unit_price} onChange={(e) => updateRow(i, { unit_price: Number(e.target.value) })}
                        className="w-24 border rounded px-2 py-1 text-right" />
                    ) : fmtILS(l.unit_price, currency)}
                  </td>
                  <td className="p-2">
                    {editable ? (
                      <input type="number" step="0.01" min={0} max={100} value={l.discount_percent}
                        onChange={(e) => updateRow(i, { discount_percent: Number(e.target.value) })}
                        className="w-16 border rounded px-2 py-1 text-right" />
                    ) : `${l.discount_percent}%`}
                  </td>
                  <td className="p-2">
                    {editable ? (
                      <input type="number" step="0.01" min={0} max={100} value={l.vat_percent}
                        onChange={(e) => updateRow(i, { vat_percent: Number(e.target.value) })}
                        className="w-16 border rounded px-2 py-1 text-right" />
                    ) : `${l.vat_percent}%`}
                  </td>
                  <td className="p-2">{fmtILS(t.line_subtotal, currency)}</td>
                  <td className="p-2">{fmtILS(t.vat_amount, currency)}</td>
                  <td className="p-2 font-semibold">{fmtILS(t.line_total, currency)}</td>
                  {editable && (
                    <td className="p-2">
                      <button onClick={() => removeRow(i)} className="text-red-600 hover:underline text-xs">
                        הסר
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-gray-50">
            <tr className="border-t">
              <td colSpan={6} className="p-2 text-left font-semibold">סה״כ חישוב:</td>
              <td className="p-2 font-semibold">{fmtILS(totals.subtotal, currency)}</td>
              <td className="p-2 font-semibold">{fmtILS(totals.vat, currency)}</td>
              <td className="p-2 font-semibold">{fmtILS(totals.total, currency)}</td>
              {editable && <td />}
            </tr>
          </tfoot>
        </table>
      </div>
      {editable && (
        <div className="flex items-center justify-between p-3 border-t gap-2">
          <button onClick={addRow} className="rounded border px-3 py-1.5 text-sm">+ הוסף שורה</button>
          <button onClick={saveAll} disabled={busy} className="rounded bg-emerald-600 px-4 py-1.5 text-white text-sm disabled:opacity-60">
            {busy ? "שומר…" : "שמור שורות + עדכן סכומים"}
          </button>
        </div>
      )}
    </div>
  );
}

// Simple effect helper that reinitialises draft when upstream key changes
function useMemoSync(key: string, cb: () => void) {
  useEffect(() => { cb(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [key]);
}
