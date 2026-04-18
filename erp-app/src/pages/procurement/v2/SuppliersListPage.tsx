import { Link } from "wouter";
import { useList, useSearchState, SearchBar, Pagination, StatusBadge, Loading, ErrorBox, EmptyBox } from "./_shared";

export default function SuppliersListPage() {
  const s = useSearchState({ limit: 50 });
  const { data, isLoading, error } = useList<any>(
    ["procurement", "suppliers", s.q, s.state, s.offset],
    "/suppliers",
    { q: s.q || undefined, status: s.state || undefined, limit: s.limit, offset: s.offset },
  );

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">ספקים</h1>
        <Link href="/suppliers/new" className="rounded bg-indigo-600 px-4 py-2 text-white text-sm">ספק חדש +</Link>
      </div>
      <div className="flex gap-2 items-center">
        <SearchBar value={s.q} onChange={(v) => { s.setQ(v); s.setOffset(0); }} placeholder="חיפוש לפי שם, מספר ספק…" />
        <select value={s.state} onChange={(e) => { s.setState(e.target.value); s.setOffset(0); }} className="rounded border px-2 py-2 text-sm">
          <option value="">כל הסטטוסים</option>
          <option value="Active">פעיל</option>
          <option value="Inactive">לא פעיל</option>
          <option value="Blacklisted">חסום</option>
          <option value="Pending">ממתין</option>
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
                <th className="p-2 text-right">שם משפטי</th>
                <th className="p-2 text-right">קטגוריה</th>
                <th className="p-2 text-right">עיר</th>
                <th className="p-2 text-right">סטטוס</th>
                <th className="p-2 text-right">דירוג ביצועים</th>
                <th className="p-2 text-right">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2">{r.supplier_number}</td>
                  <td className="p-2 font-medium">{r.legal_name}</td>
                  <td className="p-2">{r.supplier_category ?? "—"}</td>
                  <td className="p-2">{r.city ?? "—"}</td>
                  <td className="p-2"><StatusBadge state={r.status} /></td>
                  <td className="p-2">{r.performance_score ?? "—"}</td>
                  <td className="p-2">
                    <Link href={`/suppliers/${r.id}`} className="text-indigo-600 hover:underline">פתח 360</Link>
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
