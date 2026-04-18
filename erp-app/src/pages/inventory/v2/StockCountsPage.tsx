import { useQueryClient } from "@tanstack/react-query";
import { useList, useSearchState, SearchBar, Pagination, StatusBadge, Loading, ErrorBox, EmptyBox, formatDate, apiSend } from "./_shared";

export default function StockCountsPage() {
  const s = useSearchState({ limit: 50 });
  const qc = useQueryClient();
  const { data, isLoading, error } = useList<any>(
    ["inventory", "stock-counts", s.q, s.state, s.offset],
    "/stock-counts",
    { q: s.q || undefined, status: s.state || undefined, limit: s.limit, offset: s.offset },
  );

  const handleReconcile = async (id: number) => {
    try {
      const res = await apiSend<any>("POST", `/stock-counts/${id}/reconcile`);
      alert(`ספירה אוזנה בהצלחה. תנועות תיקון: ${res.adjustments_created}`);
      await qc.invalidateQueries({ queryKey: ["inventory", "stock-counts"] });
    } catch (e: any) {
      alert(`שגיאה באיזון ספירה: ${e.message}`);
    }
  };

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">ספירת מלאי</h1>
      <div className="flex gap-2 items-center">
        <SearchBar value={s.q} onChange={(v) => { s.setQ(v); s.setOffset(0); }} placeholder="חיפוש לפי מספר ספירה…" />
        <select value={s.state} onChange={(e) => { s.setState(e.target.value); s.setOffset(0); }} className="rounded border px-2 py-2 text-sm">
          <option value="">כל הסטטוסים</option>
          <option value="planned">מתוכנן</option>
          <option value="in_progress">בביצוע</option>
          <option value="counted">נספר</option>
          <option value="reconciled">אוזן</option>
          <option value="closed">סגור</option>
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
                <th className="p-2 text-right">מס' ספירה</th>
                <th className="p-2 text-right">מחסן</th>
                <th className="p-2 text-right">נספר בתאריך</th>
                <th className="p-2 text-right">אוזן בתאריך</th>
                <th className="p-2 text-right">סטטוס</th>
                <th className="p-2 text-right">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2 font-medium">{r.count_number}</td>
                  <td className="p-2">#{r.warehouse_id}</td>
                  <td className="p-2">{formatDate(r.counted_at)}</td>
                  <td className="p-2">{formatDate(r.reconciled_at)}</td>
                  <td className="p-2"><StatusBadge state={r.status} /></td>
                  <td className="p-2">
                    {r.status === "counted" && (
                      <button onClick={() => handleReconcile(r.id)} className="rounded bg-emerald-600 text-white px-3 py-1 text-xs">בצע איזון</button>
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
