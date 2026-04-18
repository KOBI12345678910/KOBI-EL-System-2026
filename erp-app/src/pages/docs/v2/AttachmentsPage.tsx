import { useList, useSearchState, SearchBar, Pagination, Loading, ErrorBox, EmptyBox, formatDate } from "./_shared";

export default function AttachmentsPage() {
  const s = useSearchState({ limit: 50 });
  const { data, isLoading, error } = useList<any>(
    ["docs", "attachments", s.q, s.state, s.offset],
    "/attachments",
    { q: s.q || undefined, entity_type: s.state || undefined, limit: s.limit, offset: s.offset },
  );

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">קבצים מצורפים</h1>
      <div className="flex gap-2 items-center">
        <SearchBar value={s.q} onChange={(v) => { s.setQ(v); s.setOffset(0); }} placeholder="חיפוש…" />
        <select value={s.state} onChange={(e) => { s.setState(e.target.value); s.setOffset(0); }} className="rounded border px-2 py-2 text-sm">
          <option value="">כל הישויות</option>
          <option value="supplier">ספק</option>
          <option value="customer">לקוח</option>
          <option value="purchase_order">הזמנת רכש</option>
          <option value="contract">חוזה</option>
          <option value="invoice">חשבונית</option>
          <option value="project">פרויקט</option>
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
                <th className="p-2 text-right">#</th>
                <th className="p-2 text-right">מסמך</th>
                <th className="p-2 text-right">ישות</th>
                <th className="p-2 text-right">מזהה ישות</th>
                <th className="p-2 text-right">צורף ב־</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((a: any) => (
                <tr key={a.id} className="border-t hover:bg-gray-50">
                  <td className="p-2">{a.id}</td>
                  <td className="p-2">{a.document_id}</td>
                  <td className="p-2">{a.entity_type}</td>
                  <td className="p-2">{a.entity_id}</td>
                  <td className="p-2">{formatDate(a.attached_at ?? a.created_at)}</td>
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
