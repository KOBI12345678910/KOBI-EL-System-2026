import { useList, useSearchState, SearchBar, Pagination, StatusBadge, Loading, ErrorBox, EmptyBox, formatDate } from "./_shared";

export default function GoodsReceiptsPage() {
  const s = useSearchState({ limit: 50 });
  const { data, isLoading, error } = useList<any>(
    ["procurement", "goods-receipts", s.q, s.state, s.offset],
    "/goods-receipts",
    { q: s.q || undefined, state: s.state || undefined, limit: s.limit, offset: s.offset },
  );

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">קבלות סחורה</h1>
      <div className="flex gap-2">
        <SearchBar value={s.q} onChange={(v) => { s.setQ(v); s.setOffset(0); }} placeholder="חיפוש לפי מספר קבלה, תעודת משלוח…" />
        <select value={s.state} onChange={(e) => { s.setState(e.target.value); s.setOffset(0); }} className="rounded border px-2 py-2 text-sm">
          <option value="">כל הסטטוסים</option>
          <option value="draft">טיוטה</option>
          <option value="received">התקבלה</option>
          <option value="partial">חלקית</option>
          <option value="inspected">נבדקה</option>
          <option value="accepted">אושרה</option>
          <option value="rejected">נדחתה</option>
          <option value="closed">נסגרה</option>
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
                <th className="p-2 text-right">מס׳ קבלה</th>
                <th className="p-2 text-right">הזמנה</th>
                <th className="p-2 text-right">ספק</th>
                <th className="p-2 text-right">תאריך קבלה</th>
                <th className="p-2 text-right">תעודת משלוח</th>
                <th className="p-2 text-right">סטטוס</th>
                <th className="p-2 text-right">בדיקה</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2 font-medium">{r.gr_number}</td>
                  <td className="p-2">{r.po_id}</td>
                  <td className="p-2">{r.supplier_id}</td>
                  <td className="p-2">{formatDate(r.receipt_date)}</td>
                  <td className="p-2">{r.delivery_note_ref ?? "—"}</td>
                  <td className="p-2"><StatusBadge state={r.state} /></td>
                  <td className="p-2 text-xs">{r.inspection_status}</td>
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
