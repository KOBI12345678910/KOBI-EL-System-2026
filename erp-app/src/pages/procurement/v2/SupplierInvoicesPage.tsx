import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiSend, useList, useSearchState, SearchBar, Pagination, StatusBadge, Loading, ErrorBox, EmptyBox, formatILS, formatDate } from "./_shared";

export default function SupplierInvoicesPage() {
  const s = useSearchState({ limit: 50 });
  const qc = useQueryClient();
  const { data, isLoading, error } = useList<any>(
    ["procurement", "supplier-invoices", s.q, s.state, s.offset],
    "/supplier-invoices",
    { q: s.q || undefined, state: s.state || undefined, limit: s.limit, offset: s.offset },
  );
  const [busy, setBusy] = useState<number | null>(null);

  async function approve(id: number) {
    if (!confirm("לאשר את החשבונית לתשלום?")) return;
    setBusy(id);
    try {
      await apiSend("POST", `/supplier-invoices/${id}/approve`, {});
      qc.invalidateQueries({ queryKey: ["procurement", "supplier-invoices"] });
    } catch (e: any) {
      if (confirm(`${e.message}\nלאשר עם override_match?`)) {
        try {
          await apiSend("POST", `/supplier-invoices/${id}/approve`, { override_match: true });
          qc.invalidateQueries({ queryKey: ["procurement", "supplier-invoices"] });
        } catch (e2: any) { alert(e2.message); }
      }
    } finally { setBusy(null); }
  }

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">חשבוניות ספקים</h1>
      <div className="flex gap-2">
        <SearchBar value={s.q} onChange={(v) => { s.setQ(v); s.setOffset(0); }} placeholder="חיפוש לפי מספר חשבונית…" />
        <select value={s.state} onChange={(e) => { s.setState(e.target.value); s.setOffset(0); }} className="rounded border px-2 py-2 text-sm">
          <option value="">כל הסטטוסים</option>
          <option value="draft">טיוטה</option>
          <option value="received">התקבלה</option>
          <option value="matched">הותאמה</option>
          <option value="approved">אושרה</option>
          <option value="paid">שולמה</option>
          <option value="disputed">במחלוקת</option>
        </select>
      </div>
      {isLoading && <Loading />}
      {error && <ErrorBox err={error} />}
      {data && data.rows.length === 0 && <EmptyBox />}
      {data && data.rows.length > 0 && (
        <div className="overflow-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 text-right">מס׳ חשבונית</th>
                <th className="p-2 text-right">ספק</th>
                <th className="p-2 text-right">הזמנה</th>
                <th className="p-2 text-right">תאריך</th>
                <th className="p-2 text-right">לתשלום עד</th>
                <th className="p-2 text-right">סה״כ</th>
                <th className="p-2 text-right">הותאם ל-PO</th>
                <th className="p-2 text-right">סטטוס</th>
                <th className="p-2 text-right">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2 font-medium">{r.supplier_invoice_number}</td>
                  <td className="p-2">{r.supplier_id}</td>
                  <td className="p-2">{r.po_id ?? "—"}</td>
                  <td className="p-2">{formatDate(r.invoice_date)}</td>
                  <td className="p-2">{formatDate(r.due_date)}</td>
                  <td className="p-2 font-semibold">{formatILS(r.grand_total)}</td>
                  <td className="p-2">{r.matched_po ? "✓" : "—"}</td>
                  <td className="p-2"><StatusBadge state={r.state} /></td>
                  <td className="p-2">
                    {r.state !== "approved" && r.state !== "paid" && (
                      <button onClick={() => approve(r.id)} disabled={busy === r.id} className="text-emerald-700 hover:underline text-sm disabled:opacity-60">אשר לתשלום</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination offset={s.offset} limit={s.limit} total={data?.total} onChange={s.setOffset} />
    </div>
  );
}
