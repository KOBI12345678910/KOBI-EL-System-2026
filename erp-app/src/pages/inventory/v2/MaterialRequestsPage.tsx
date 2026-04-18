import { useQueryClient } from "@tanstack/react-query";
import { useList, useSearchState, SearchBar, Pagination, StatusBadge, Loading, ErrorBox, EmptyBox, formatDate, apiSend } from "./_shared";

export default function MaterialRequestsPage() {
  const s = useSearchState({ limit: 50 });
  const qc = useQueryClient();
  const { data, isLoading, error } = useList<any>(
    ["inventory", "material-requests", s.q, s.state, s.offset],
    "/material-requests",
    { q: s.q || undefined, status: s.state || undefined, limit: s.limit, offset: s.offset },
  );

  const handleApprove = async (id: number) => {
    try { await apiSend("POST", `/material-requests/${id}/approve`); await qc.invalidateQueries({ queryKey: ["inventory", "material-requests"] }); }
    catch (e: any) { alert(`שגיאה באישור: ${e.message}`); }
  };
  const handleFulfill = async (id: number) => {
    try { await apiSend("POST", `/material-requests/${id}/fulfill`); await qc.invalidateQueries({ queryKey: ["inventory", "material-requests"] }); }
    catch (e: any) { alert(`שגיאה בסיפוק בקשה: ${e.message}`); }
  };

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">בקשות חומרים</h1>
      <div className="flex gap-2 items-center">
        <SearchBar value={s.q} onChange={(v) => { s.setQ(v); s.setOffset(0); }} placeholder="חיפוש לפי מספר בקשה…" />
        <select value={s.state} onChange={(e) => { s.setState(e.target.value); s.setOffset(0); }} className="rounded border px-2 py-2 text-sm">
          <option value="">כל הסטטוסים</option>
          <option value="draft">טיוטה</option>
          <option value="submitted">הוגש</option>
          <option value="approved">אושר</option>
          <option value="fulfilled">סופק</option>
          <option value="rejected">נדחה</option>
          <option value="cancelled">בוטל</option>
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
                <th className="p-2 text-right">מס' בקשה</th>
                <th className="p-2 text-right">פרויקט</th>
                <th className="p-2 text-right">הוזמן בתאריך</th>
                <th className="p-2 text-right">נדרש עד</th>
                <th className="p-2 text-right">סטטוס</th>
                <th className="p-2 text-right">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2 font-medium">{r.request_number}</td>
                  <td className="p-2">{r.project_id ?? "—"}</td>
                  <td className="p-2">{formatDate(r.requested_date)}</td>
                  <td className="p-2">{formatDate(r.needed_by_date)}</td>
                  <td className="p-2"><StatusBadge state={r.status} /></td>
                  <td className="p-2 space-x-1 space-x-reverse">
                    {(r.status === "draft" || r.status === "submitted") && (
                      <button onClick={() => handleApprove(r.id)} className="rounded bg-green-600 text-white px-3 py-1 text-xs">אשר</button>
                    )}
                    {r.status === "approved" && (
                      <button onClick={() => handleFulfill(r.id)} className="rounded bg-emerald-600 text-white px-3 py-1 text-xs">ספק</button>
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
