import { useRoute, Link } from "wouter";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiSend, useDetail, useList, StatusBadge, Loading, ErrorBox, formatDate, formatILS } from "./_shared";

export default function RFQ360() {
  const [, params] = useRoute<{ id: string }>("/rfqs/:id");
  const id = params?.id;
  const qc = useQueryClient();
  const { data: rfq, isLoading, error } = useDetail<any>(["procurement", "rfq", id], `/rfqs/${id}`, !!id);
  const { data: lines } = useList<any>(["procurement", "rfq-lines", id], `/rfqs/${id}/lines`);
  const { data: bids } = useList<any>(["procurement", "rfq-bids", id], "/rfq-bids", { rfq_id: id });
  const [busy, setBusy] = useState(false);

  async function sendRfq() {
    const idsRaw = prompt("IDs של ספקים (מופרדים בפסיק):");
    if (!idsRaw) return;
    const supplierIds = idsRaw.split(",").map((s) => Number(s.trim())).filter(Boolean);
    if (!supplierIds.length) return;
    setBusy(true);
    try {
      await apiSend("POST", `/rfqs/${id}/send`, { invited_supplier_ids: supplierIds });
      qc.invalidateQueries({ queryKey: ["procurement", "rfq", id] });
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  }

  async function awardBid(bidId: number) {
    if (!confirm(`לאשר כהצעה הזוכה את הצעה #${bidId}?`)) return;
    setBusy(true);
    try {
      await apiSend("POST", `/rfqs/${id}/award/${bidId}`, {});
      qc.invalidateQueries({ queryKey: ["procurement", "rfq", id] });
      qc.invalidateQueries({ queryKey: ["procurement", "rfq-bids", id] });
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  }

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox err={error} />;
  if (!rfq) return null;

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-gray-500">RFQ #{rfq.rfq_number}</div>
          <h1 className="text-3xl font-semibold">בקשת הצעה</h1>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <StatusBadge state={rfq.state} />
            <span>תאריך בקשה: {formatDate(rfq.requested_date)}</span>
            {rfq.response_deadline && <span>מועד אחרון: {formatDate(rfq.response_deadline)}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/rfqs/${id}/items`} className="rounded border px-3 py-1.5 text-sm">ערוך שורות</Link>
          {rfq.state === "draft" && (
            <button onClick={sendRfq} disabled={busy} className="rounded bg-indigo-600 px-3 py-1.5 text-white text-sm disabled:opacity-60">שלח לספקים</button>
          )}
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Kpi label="שורות פריטים" value={(rfq.counts?.items ?? 0).toString()} />
        <Kpi label="ספקים שהוזמנו" value={(rfq.counts?.invites ?? 0).toString()} />
        <Kpi label="הצעות התקבלו" value={(rfq.counts?.bids ?? 0).toString()} />
        <Kpi label="סטטוס אישור" value={rfq.approval_status ?? "—"} />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">שורות פריטים</h2>
        <div className="overflow-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 text-right">#</th>
                <th className="p-2 text-right">תיאור</th>
                <th className="p-2 text-right">כמות</th>
                <th className="p-2 text-right">יח׳</th>
                <th className="p-2 text-right">תאריך יעד</th>
              </tr>
            </thead>
            <tbody>
              {(lines?.rows ?? []).map((l: any) => (
                <tr key={l.id} className="border-t">
                  <td className="p-2">{l.line_number}</td>
                  <td className="p-2">{l.description}</td>
                  <td className="p-2">{l.quantity}</td>
                  <td className="p-2">{l.unit_of_measure ?? "—"}</td>
                  <td className="p-2">{formatDate(l.target_delivery_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">הצעות ספקים</h2>
        <div className="overflow-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 text-right">ספק</th>
                <th className="p-2 text-right">מס׳ הצעה</th>
                <th className="p-2 text-right">תאריך</th>
                <th className="p-2 text-right">תוקף עד</th>
                <th className="p-2 text-right">סה״כ כולל מע״מ</th>
                <th className="p-2 text-right">ימי אספקה</th>
                <th className="p-2 text-right">סטטוס</th>
                <th className="p-2 text-right">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {(bids?.rows ?? []).map((b: any) => (
                <tr key={b.id} className={`border-t ${b.selected ? "bg-emerald-50" : ""}`}>
                  <td className="p-2">{b.supplier_id}</td>
                  <td className="p-2">{b.quote_reference ?? `BID-${b.id}`}</td>
                  <td className="p-2">{formatDate(b.quote_date)}</td>
                  <td className="p-2">{formatDate(b.valid_until)}</td>
                  <td className="p-2 font-semibold">{formatILS(b.grand_total)}</td>
                  <td className="p-2">{b.delivery_days_estimate ?? "—"}</td>
                  <td className="p-2"><StatusBadge state={b.selected ? "awarded" : b.state} /></td>
                  <td className="p-2">
                    {rfq.state !== "awarded" && !b.selected && (
                      <button onClick={() => awardBid(b.id)} disabled={busy} className="text-emerald-700 hover:underline text-sm disabled:opacity-60">הענק</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border bg-white p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
