import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiSend, useList, useSearchState, Pagination, StatusBadge, Loading, ErrorBox, EmptyBox, formatILS, formatDate } from "./_shared";

export default function ThreeWayMatchQueue() {
  const s = useSearchState({ state: "pending", limit: 50 });
  const qc = useQueryClient();
  const { data, isLoading, error } = useList<any>(
    ["procurement", "three-way-matches", s.state, s.offset],
    "/three-way-matches",
    { state: s.state || undefined, limit: s.limit, offset: s.offset },
  );
  const [busy, setBusy] = useState<number | null>(null);

  async function resolve(matchId: number) {
    const action = prompt("פעולת פתרון:");
    if (!action) return;
    const notes = prompt("הערות (אופציונלי):") ?? undefined;
    setBusy(matchId);
    try {
      await apiSend("POST", `/three-way-matches/${matchId}/resolve`, { resolution_action: action, notes });
      qc.invalidateQueries({ queryKey: ["procurement", "three-way-matches"] });
    } catch (e: any) { alert(e.message); } finally { setBusy(null); }
  }

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">תור התאמה תלת-כיוונית</h1>
      <div className="flex gap-2 text-sm">
        <select value={s.state} onChange={(e) => { s.setState(e.target.value); s.setOffset(0); }} className="rounded border px-2 py-2">
          <option value="">הכל</option>
          <option value="pending">ממתין</option>
          <option value="matched">הותאם</option>
          <option value="discrepancy">אי-התאמה</option>
          <option value="resolved">נפתר</option>
        </select>
      </div>
      {isLoading && <Loading />}
      {error && <ErrorBox err={error} />}
      {data && data.rows.length === 0 && <EmptyBox label="אין פריטים בתור" />}
      {data && data.rows.length > 0 && (
        <div className="overflow-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 text-right">מס׳ התאמה</th>
                <th className="p-2 text-right">הזמנה</th>
                <th className="p-2 text-right">קבלה</th>
                <th className="p-2 text-right">חשבונית</th>
                <th className="p-2 text-right">תאריך</th>
                <th className="p-2 text-right">הפרש כמותי</th>
                <th className="p-2 text-right">הפרש מחיר</th>
                <th className="p-2 text-right">סטיה %</th>
                <th className="p-2 text-right">מעבר לסף</th>
                <th className="p-2 text-right">סטטוס</th>
                <th className="p-2 text-right">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((m: any) => (
                <tr key={m.id} className={`border-t ${m.tolerance_exceeded ? "bg-orange-50" : ""}`}>
                  <td className="p-2 font-medium">{m.match_number}</td>
                  <td className="p-2">{m.po_id}</td>
                  <td className="p-2">{m.goods_receipt_id ?? "—"}</td>
                  <td className="p-2">{m.supplier_invoice_id ?? "—"}</td>
                  <td className="p-2">{formatDate(m.match_date)}</td>
                  <td className="p-2">{m.quantity_variance}</td>
                  <td className="p-2">{formatILS(m.price_variance)}</td>
                  <td className="p-2">{m.variance_percent}%</td>
                  <td className="p-2">{m.tolerance_exceeded ? "⚠️" : "—"}</td>
                  <td className="p-2"><StatusBadge state={m.state} /></td>
                  <td className="p-2">
                    {m.state !== "resolved" && (
                      <button onClick={() => resolve(m.id)} disabled={busy === m.id} className="text-emerald-700 hover:underline text-sm disabled:opacity-60">פתור</button>
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
