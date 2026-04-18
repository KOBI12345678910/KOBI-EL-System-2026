import { useState } from "react";
import { useList, useSearchState, Pagination, StatusBadge, Loading, ErrorBox, EmptyBox, formatNum, formatDate, apiSend } from "./_shared";

export default function ReorderRulesPage() {
  const s = useSearchState({ limit: 50 });
  const [triggerResult, setTriggerResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const { data, isLoading, error } = useList<any>(
    ["inventory", "reorder-rules", s.state, s.offset],
    "/reorder-rules",
    { status: s.state || undefined, limit: s.limit, offset: s.offset },
  );

  const runTrigger = async () => {
    setBusy(true);
    try {
      const res = await apiSend("POST", "/reorder-rules/trigger", { dry_run: true });
      setTriggerResult(res);
    } catch (e: any) {
      alert(`שגיאה בהרצת הכללים: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">כללי הזמנה חוזרת</h1>
        <button onClick={runTrigger} disabled={busy}
          className="rounded bg-amber-600 text-white px-4 py-2 text-sm disabled:opacity-50">
          {busy ? "מריץ…" : "הרץ כללים עכשיו (Dry Run)"}
        </button>
      </div>

      {triggerResult && (
        <div className="rounded border bg-amber-50 p-4 space-y-2">
          <div className="font-medium">תוצאות הרצה:</div>
          <div className="text-sm">חוקים נבדקו: {triggerResult.evaluated} · המלצות חדשות: {triggerResult.suggestion_count}</div>
          {triggerResult.suggestions.length > 0 && (
            <div className="overflow-auto rounded border bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-2 text-right">חומר</th>
                    <th className="p-2 text-right">זמין</th>
                    <th className="p-2 text-right">מינימום</th>
                    <th className="p-2 text-right">להזמין</th>
                    <th className="p-2 text-right">ספק מועדף</th>
                  </tr>
                </thead>
                <tbody>
                  {triggerResult.suggestions.map((sug: any) => (
                    <tr key={sug.rule_id} className="border-t">
                      <td className="p-2">{sug.material_code} · {sug.material_name}</td>
                      <td className="p-2">{formatNum(sug.available_qty)}</td>
                      <td className="p-2">{formatNum(sug.min_qty)}</td>
                      <td className="p-2 font-medium">{formatNum(sug.reorder_qty)}</td>
                      <td className="p-2">{sug.preferred_supplier_id ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 items-center">
        <select value={s.state} onChange={(e) => { s.setState(e.target.value); s.setOffset(0); }} className="rounded border px-2 py-2 text-sm">
          <option value="">כל הסטטוסים</option>
          <option value="active">פעיל</option>
          <option value="paused">מושהה</option>
          <option value="disabled">מבוטל</option>
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
                <th className="p-2 text-right">חומר</th>
                <th className="p-2 text-right">מחסן</th>
                <th className="p-2 text-right">מינ'</th>
                <th className="p-2 text-right">מקס'</th>
                <th className="p-2 text-right">כמות להזמנה</th>
                <th className="p-2 text-right">Lead time</th>
                <th className="p-2 text-right">סטטוס</th>
                <th className="p-2 text-right">הופעל לאחרונה</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2">#{r.material_id}</td>
                  <td className="p-2">{r.warehouse_id ?? "הכל"}</td>
                  <td className="p-2">{formatNum(r.min_qty)}</td>
                  <td className="p-2">{formatNum(r.max_qty)}</td>
                  <td className="p-2 font-medium">{formatNum(r.reorder_qty)}</td>
                  <td className="p-2">{r.lead_time_days} ימים</td>
                  <td className="p-2"><StatusBadge state={r.status} /></td>
                  <td className="p-2">{formatDate(r.last_triggered_at)}</td>
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
