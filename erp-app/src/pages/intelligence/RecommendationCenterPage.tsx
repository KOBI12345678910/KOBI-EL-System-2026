import { useQueryClient } from "@tanstack/react-query";
import { useList, useSearchState, apiSend, SearchBar, Pagination, StatusBadge, Loading, ErrorBox, EmptyBox, PageHeader, formatDate } from "./_shared";

export default function RecommendationCenterPage() {
  const s = useSearchState({ limit: 50 });
  const qc = useQueryClient();
  const queryKey = ["intelligence", "decision-recommendations", s.q, s.state, s.offset];
  const { data, isLoading, error } = useList<any>(queryKey, "/decision-recommendations", {
    q: s.q || undefined, status: s.state || undefined, limit: s.limit, offset: s.offset,
  });

  async function doAction(action: "accept" | "reject", id: number) {
    await apiSend("POST", `/decision-recommendations/${id}/${action}`);
    qc.invalidateQueries({ queryKey: queryKey as any });
  }

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <PageHeader title="מרכז המלצות" />
      <div className="flex gap-2 items-center">
        <SearchBar value={s.q} onChange={(v) => { s.setQ(v); s.setOffset(0); }} placeholder="חיפוש לפי מספר המלצה…" />
        <select value={s.state} onChange={(e) => { s.setState(e.target.value); s.setOffset(0); }} className="rounded border px-2 py-2 text-sm">
          <option value="">כל הסטטוסים</option>
          <option value="pending">ממתין</option>
          <option value="accepted">התקבל</option>
          <option value="rejected">נדחה</option>
          <option value="expired">פג תוקף</option>
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
                <th className="p-2 text-right">מספר</th>
                <th className="p-2 text-right">סוג</th>
                <th className="p-2 text-right">ישות</th>
                <th className="p-2 text-right">טקסט</th>
                <th className="p-2 text-right">עדיפות</th>
                <th className="p-2 text-right">ביטחון</th>
                <th className="p-2 text-right">סטטוס</th>
                <th className="p-2 text-right">נוצר</th>
                <th className="p-2 text-right">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2 font-medium">{r.recommendation_number}</td>
                  <td className="p-2">{r.recommendation_type}</td>
                  <td className="p-2">{r.parent_entity_type} #{r.parent_entity_id}</td>
                  <td className="p-2 max-w-md truncate" title={r.recommendation_text}>{r.recommendation_text}</td>
                  <td className="p-2">{r.priority ?? "—"}</td>
                  <td className="p-2">{r.confidence_score != null ? Number(r.confidence_score).toFixed(2) : "—"}</td>
                  <td className="p-2"><StatusBadge state={r.status} /></td>
                  <td className="p-2">{formatDate(r.created_at)}</td>
                  <td className="p-2 space-x-1 space-x-reverse">
                    <button className="text-emerald-700 hover:underline" onClick={() => doAction("accept", r.id)}>קבל</button>
                    <button className="text-red-700 hover:underline" onClick={() => doAction("reject", r.id)}>דחה</button>
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
