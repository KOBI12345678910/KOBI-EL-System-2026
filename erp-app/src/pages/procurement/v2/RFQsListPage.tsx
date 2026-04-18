import { Link } from "wouter";
import { useList, useSearchState, SearchBar, Pagination, StatusBadge, Loading, ErrorBox, EmptyBox, formatDate } from "./_shared";

export default function RFQsListPage() {
  const s = useSearchState({ limit: 50 });
  const { data, isLoading, error } = useList<any>(
    ["procurement", "rfqs", s.q, s.state, s.offset],
    "/rfqs",
    { q: s.q || undefined, state: s.state || undefined, limit: s.limit, offset: s.offset },
  );

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">בקשות הצעה (RFQ)</h1>
        <Link href="/rfqs/new" className="rounded bg-indigo-600 px-4 py-2 text-white text-sm">RFQ חדש +</Link>
      </div>
      <div className="flex gap-2">
        <SearchBar value={s.q} onChange={(v) => { s.setQ(v); s.setOffset(0); }} placeholder="חיפוש לפי מספר RFQ, הערות…" />
        <select value={s.state} onChange={(e) => { s.setState(e.target.value); s.setOffset(0); }} className="rounded border px-2 py-2 text-sm">
          <option value="">כל הסטטוסים</option>
          <option value="draft">טיוטה</option>
          <option value="sent">נשלחה</option>
          <option value="responded">התקבלו הצעות</option>
          <option value="awarded">הוענקה</option>
          <option value="cancelled">בוטלה</option>
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
                <th className="p-2 text-right">מס׳ RFQ</th>
                <th className="p-2 text-right">תאריך בקשה</th>
                <th className="p-2 text-right">מועד אחרון למענה</th>
                <th className="p-2 text-right">ספק זוכה</th>
                <th className="p-2 text-right">סטטוס</th>
                <th className="p-2 text-right">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2 font-medium">{r.rfq_number}</td>
                  <td className="p-2">{formatDate(r.requested_date)}</td>
                  <td className="p-2">{formatDate(r.response_deadline)}</td>
                  <td className="p-2">{r.winning_supplier_id ?? "—"}</td>
                  <td className="p-2"><StatusBadge state={r.state} /></td>
                  <td className="p-2">
                    <Link href={`/rfqs/${r.id}`} className="text-indigo-600 hover:underline">פתח</Link>
                    <span className="mx-2">•</span>
                    <Link href={`/rfqs/${r.id}/items`} className="text-indigo-600 hover:underline">שורות</Link>
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
