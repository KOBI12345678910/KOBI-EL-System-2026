import { useList, useSearchState, SearchBar, Pagination, StatusBadge, Loading, ErrorBox, EmptyBox, formatDate } from "./_shared";

export default function ManufacturingBatchesPage() {
  const s = useSearchState({ limit: 50 });
  const { data, isLoading, error } = useList<any>(
    ["inventory", "batches", s.q, s.state, s.offset],
    "/manufacturing-batches",
    { q: s.q || undefined, state: s.state || undefined, limit: s.limit, offset: s.offset },
  );

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">אצוות ייצור</h1>
      <div className="flex gap-2 items-center">
        <SearchBar value={s.q} onChange={(v) => { s.setQ(v); s.setOffset(0); }} placeholder="חיפוש לפי מספר אצווה…" />
        <select value={s.state} onChange={(e) => { s.setState(e.target.value); s.setOffset(0); }} className="rounded border px-2 py-2 text-sm">
          <option value="">כל המצבים</option>
          <option value="Open">פתוח</option>
          <option value="InProgress">בעבודה</option>
          <option value="Completed">הושלם</option>
          <option value="Cancelled">בוטל</option>
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
                <th className="p-2 text-right">מס' אצווה</th>
                <th className="p-2 text-right">פרויקט</th>
                <th className="p-2 text-right">הזמנת עבודה</th>
                <th className="p-2 text-right">התחיל</th>
                <th className="p-2 text-right">הושלם</th>
                <th className="p-2 text-right">מצב</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2 font-medium">{r.batch_number}</td>
                  <td className="p-2">{r.project_id ?? "—"}</td>
                  <td className="p-2">{r.work_order_id ?? "—"}</td>
                  <td className="p-2">{formatDate(r.started_at)}</td>
                  <td className="p-2">{formatDate(r.completed_at)}</td>
                  <td className="p-2"><StatusBadge state={r.state} /></td>
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
