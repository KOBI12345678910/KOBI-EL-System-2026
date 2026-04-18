import { useRoute, Link } from "wouter";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiSend, useDetail, useList, StatusBadge, Loading, ErrorBox, formatDate, formatILS } from "./_shared";

export default function PurchaseOrder360() {
  const [, params] = useRoute<{ id: string }>("/purchase-orders/:id");
  const id = params?.id;
  const qc = useQueryClient();
  const { data: po, isLoading, error } = useDetail<any>(["procurement", "po", id], `/purchase-orders/${id}`, !!id);
  const { data: lines } = useList<any>(["procurement", "po-lines", id], `/purchase-orders/${id}/lines`);
  const { data: receipts } = useList<any>(["procurement", "po-receipts", id], "/goods-receipts", { po_id: id });
  const { data: invoices } = useList<any>(["procurement", "po-invoices", id], "/supplier-invoices", { po_id: id });
  const [busy, setBusy] = useState(false);

  async function approve() {
    if (!confirm("לאשר את ההזמנה?")) return;
    setBusy(true);
    try {
      await apiSend("POST", `/purchase-orders/${id}/approve`, {});
      qc.invalidateQueries({ queryKey: ["procurement", "po", id] });
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  }

  async function submit() {
    if (!confirm("לשלוח את ההזמנה לספק?")) return;
    setBusy(true);
    try {
      await apiSend("POST", `/purchase-orders/${id}/submit`, {});
      qc.invalidateQueries({ queryKey: ["procurement", "po", id] });
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  }

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox err={error} />;
  if (!po) return null;

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-gray-500">הזמנת רכש #{po.po_number}</div>
          <h1 className="text-3xl font-semibold">{formatILS(po.grand_total)}</h1>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <StatusBadge state={po.state} />
            <span>ספק: {po.supplier_id}</span>
            <span>תאריך: {formatDate(po.order_date)}</span>
            {po.expected_delivery_date && <span>יעד: {formatDate(po.expected_delivery_date)}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/purchase-orders/${id}/lines`} className="rounded border px-3 py-1.5 text-sm">שורות</Link>
          {(po.state === "draft" || po.state === "pending_approval") && (
            <button onClick={approve} disabled={busy} className="rounded bg-emerald-600 px-3 py-1.5 text-white text-sm disabled:opacity-60">אשר</button>
          )}
          {po.state === "approved" && (
            <button onClick={submit} disabled={busy} className="rounded bg-indigo-600 px-3 py-1.5 text-white text-sm disabled:opacity-60">שלח לספק</button>
          )}
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Kpi label="סה״כ לפני מע״מ" value={formatILS(po.subtotal)} />
        <Kpi label="הנחה" value={formatILS(po.discount_total)} />
        <Kpi label="מע״מ" value={formatILS(po.vat_total)} />
        <Kpi label="סה״כ כולל מע״מ" value={formatILS(po.grand_total)} />
        <Kpi label="שורות" value={(po.counts?.lines ?? 0).toString()} />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">שורות ההזמנה</h2>
        <div className="overflow-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 text-right">#</th>
                <th className="p-2 text-right">תיאור</th>
                <th className="p-2 text-right">כמות הוזמנה</th>
                <th className="p-2 text-right">כמות התקבלה</th>
                <th className="p-2 text-right">פתוח</th>
                <th className="p-2 text-right">מחיר יח׳</th>
                <th className="p-2 text-right">סה״כ שורה</th>
              </tr>
            </thead>
            <tbody>
              {(lines?.rows ?? []).map((l: any) => (
                <tr key={l.id} className="border-t">
                  <td className="p-2">{l.line_number}</td>
                  <td className="p-2">{l.description}</td>
                  <td className="p-2">{l.quantity_ordered}</td>
                  <td className="p-2">{l.quantity_received}</td>
                  <td className="p-2">{l.quantity_open}</td>
                  <td className="p-2">{formatILS(l.unit_price)}</td>
                  <td className="p-2 font-semibold">{formatILS(l.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">קבלות סחורה</h2>
        <MiniTable cols={["מס׳", "תאריך", "סטטוס", "בדיקה"]} rows={(receipts?.rows ?? []).map((r: any) => [r.gr_number, formatDate(r.receipt_date), r.state, r.inspection_status])} />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">חשבוניות ספק</h2>
        <MiniTable cols={["מס׳ חשבונית", "תאריך", "סה״כ", "סטטוס"]} rows={(invoices?.rows ?? []).map((i: any) => [i.supplier_invoice_number, formatDate(i.invoice_date), formatILS(i.grand_total), i.state])} />
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border bg-white p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

function MiniTable({ cols, rows }: { cols: string[]; rows: (string | number | null | undefined)[][] }) {
  if (!rows || rows.length === 0) return <div className="text-sm text-gray-400">אין נתונים</div>;
  return (
    <div className="overflow-auto rounded border">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>{cols.map((c) => <th key={c} className="p-2 text-right text-xs font-semibold text-gray-600">{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => <tr key={i} className="border-t">{r.map((v, j) => <td key={j} className="p-2">{v ?? "—"}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}
