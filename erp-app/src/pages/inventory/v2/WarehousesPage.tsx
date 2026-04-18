import { useList, useSearchState, SearchBar, Pagination, Loading, ErrorBox, EmptyBox } from "./_shared";

export default function WarehousesPage() {
  const s = useSearchState({ limit: 50 });
  const { data, isLoading, error } = useList<any>(
    ["inventory", "warehouses", s.q, s.offset],
    "/warehouses",
    { q: s.q || undefined, limit: s.limit, offset: s.offset },
  );

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">מחסנים</h1>
      <SearchBar value={s.q} onChange={(v) => { s.setQ(v); s.setOffset(0); }} placeholder="חיפוש מחסנים…" />
      {isLoading && <Loading />}
      {error && <ErrorBox err={error} />}
      {data && data.rows.length === 0 && <EmptyBox />}
      {data && data.rows.length > 0 && (
        <div className="overflow-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 text-right">קוד</th>
                <th className="p-2 text-right">שם</th>
                <th className="p-2 text-right">סוג</th>
                <th className="p-2 text-right">מיקום</th>
                <th className="p-2 text-right">עיר</th>
                <th className="p-2 text-right">פעיל</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2 font-medium">{r.warehouse_code}</td>
                  <td className="p-2">{r.name}</td>
                  <td className="p-2">{r.warehouse_type ?? "—"}</td>
                  <td className="p-2">{r.location_name ?? "—"}</td>
                  <td className="p-2">{r.city ?? "—"}</td>
                  <td className="p-2">{r.active ? "✓" : "—"}</td>
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
