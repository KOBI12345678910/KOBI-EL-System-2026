import { useQueryClient } from "@tanstack/react-query";
import { useList, useSearchState, apiSend, SearchBar, Pagination, StatusBadge, Loading, ErrorBox, EmptyBox, PageHeader, formatDate } from "./_shared";

export default function OrchestrationFlowsPage() {
  const s = useSearchState({ limit: 50 });
  const qc = useQueryClient();
  const queryKey = ["intelligence", "orchestration-flows", s.q, s.state, s.offset];
  const { data, isLoading, error } = useList<any>(queryKey, "/orchestration-flows", {
    q: s.q || undefined, status: s.state || undefined, limit: s.limit, offset: s.offset,
  });

  async function trigger(id: string) {
    await apiSend("POST", `/orchestration-flows/${id}/trigger`, { input: {} });
    qc.invalidateQueries({ queryKey: queryKey as any });
  }

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <PageHeader title="תזמורת זרימות (ניהול)" />
      <div className="flex gap-2 items-center">
        <SearchBar value={s.q} onChange={(v) => { s.setQ(v); s.setOffset(0); }} placeholder="חיפוש לפי שם זרימה…" />
        <select value={s.state} onChange={(e) => { s.setState(e.target.value); s.setOffset(0); }} className="rounded border px-2 py-2 text-sm">
          <option value="">כל הסטטוסים</option>
          <option value="draft">טיוטה</option>
          <option value="active">פעיל</option>
          <option value="paused">מושהה</option>
          <option value="completed">הושלם</option>
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
                <th className="p-2 text-right">שם</th>
                <th className="p-2 text-right">תיאור</th>
                <th className="p-2 text-right">טריגר</th>
                <th className="p-2 text-right">סטטוס</th>
                <th className="p-2 text-right">ריצה אחרונה</th>
                <th className="p-2 text-right">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2 font-medium">{r.flow_name}</td>
                  <td className="p-2 max-w-sm truncate" title={r.description}>{r.description ?? "—"}</td>
                  <td className="p-2">{r.trigger_type}</td>
                  <td className="p-2"><StatusBadge state={r.status} /></td>
                  <td className="p-2">{formatDate(r.last_run_at)}</td>
                  <td className="p-2">
                    <button className="text-indigo-700 hover:underline" onClick={() => trigger(r.id)}>הפעל עכשיו</button>
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
