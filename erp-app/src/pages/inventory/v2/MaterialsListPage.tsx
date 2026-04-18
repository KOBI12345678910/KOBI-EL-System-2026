import { Link } from "wouter";
import { useList, useSearchState, SearchBar, Pagination, Loading, ErrorBox, EmptyBox, formatNum } from "./_shared";

export default function MaterialsListPage() {
  const s = useSearchState({ limit: 50 });
  const { data, isLoading, error } = useList<any>(
    ["inventory", "materials", s.q, s.offset],
    "/materials",
    { q: s.q || undefined, limit: s.limit, offset: s.offset },
  );

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">חומרים</h1>
        <Link href="/materials/new" className="rounded bg-indigo-600 px-4 py-2 text-white text-sm">חומר חדש +</Link>
      </div>
      <div className="flex gap-2 items-center">
        <SearchBar value={s.q} onChange={(v) => { s.setQ(v); s.setOffset(0); }} placeholder="חיפוש לפי שם, קוד חומר, ברקוד…" />
      </div>
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
                <th className="p-2 text-right">יחידה</th>
                <th className="p-2 text-right">עלות תקן</th>
                <th className="p-2 text-right">נקודת הזמנה</th>
                <th className="p-2 text-right">מלאי בטחון</th>
                <th className="p-2 text-right">ברקוד</th>
                <th className="p-2 text-right">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2">{r.material_code}</td>
                  <td className="p-2 font-medium">{r.name}</td>
                  <td className="p-2">{r.unit_of_measure ?? "—"}</td>
                  <td className="p-2">{formatNum(r.standard_cost)}</td>
                  <td className="p-2">{formatNum(r.reorder_point)}</td>
                  <td className="p-2">{formatNum(r.safety_stock)}</td>
                  <td className="p-2">{r.barcode ?? "—"}</td>
                  <td className="p-2">
                    <Link href={`/materials/${r.id}`} className="text-indigo-600 hover:underline">פתח 360</Link>
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
