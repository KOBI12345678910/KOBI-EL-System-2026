import { Link } from "wouter";
import { useList, useSearchState, SearchBar, Pagination, StatusBadge, Loading, ErrorBox, EmptyBox, formatNum, formatDate } from "./_shared";

export default function MaterialLotsPage() {
  const s = useSearchState({ limit: 50 });
  const { data, isLoading, error } = useList<any>(
    ["inventory", "lots", s.q, s.state, s.offset],
    "/material-lots",
    { q: s.q || undefined, status: s.state || undefined, limit: s.limit, offset: s.offset },
  );

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">אצוות (Lots) — עקיבות</h1>
      <div className="flex gap-2 items-center">
        <SearchBar value={s.q} onChange={(v) => { s.setQ(v); s.setOffset(0); }} placeholder="חיפוש לפי מספר אצווה…" />
        <select value={s.state} onChange={(e) => { s.setState(e.target.value); s.setOffset(0); }} className="rounded border px-2 py-2 text-sm">
          <option value="">כל המצבים</option>
          <option value="active">פעיל</option>
          <option value="quarantined">בהסגר</option>
          <option value="consumed">נוצל</option>
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
                <th className="p-2 text-right">מס' אצווה</th>
                <th className="p-2 text-right">חומר</th>
                <th className="p-2 text-right">מחסן</th>
                <th className="p-2 text-right">כמות</th>
                <th className="p-2 text-right">התקבל</th>
                <th className="p-2 text-right">תוקף</th>
                <th className="p-2 text-right">סטטוס</th>
                <th className="p-2 text-right">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2 font-medium">{r.lot_number}</td>
                  <td className="p-2">#{r.material_id}</td>
                  <td className="p-2">#{r.warehouse_id}</td>
                  <td className="p-2">{formatNum(r.quantity_on_hand)}</td>
                  <td className="p-2">{formatDate(r.received_at)}</td>
                  <td className="p-2">{formatDate(r.expiry_date)}</td>
                  <td className="p-2"><StatusBadge state={r.status} /></td>
                  <td className="p-2">
                    <Link href={`/materials/${r.material_id}`} className="text-indigo-600 hover:underline">חומר</Link>
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
