import { useList, useSearchState, SearchBar, Pagination, StatusBadge, Loading, ErrorBox, EmptyBox, formatNum, formatDate } from "./_shared";

export default function InventoryJournalPage() {
  const s = useSearchState({ limit: 100 });
  const { data, isLoading, error } = useList<any>(
    ["inventory", "journal", s.q, s.state, s.offset],
    "/inventory/journal",
    { q: s.q || undefined, status: s.state || undefined, limit: s.limit, offset: s.offset },
  );

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">יומן תנועות מלאי</h1>
      </div>
      <div className="flex gap-2 items-center">
        <SearchBar value={s.q} onChange={(v) => { s.setQ(v); s.setOffset(0); }} placeholder="חיפוש לפי קוד תנועה / הערות…" />
        <select value={s.state} onChange={(e) => { s.setState(e.target.value); s.setOffset(0); }} className="rounded border px-2 py-2 text-sm">
          <option value="">כל הסטטוסים</option>
          <option value="pending">ממתין</option>
          <option value="posted">נרשם</option>
          <option value="reversed">בוטל</option>
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
                <th className="p-2 text-right">תאריך</th>
                <th className="p-2 text-right">חומר</th>
                <th className="p-2 text-right">מחסן</th>
                <th className="p-2 text-right">סוג</th>
                <th className="p-2 text-right">כמות</th>
                <th className="p-2 text-right">עלות יחידה</th>
                <th className="p-2 text-right">סטטוס</th>
                <th className="p-2 text-right">הפניה</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2">{formatDate(r.movement_date)}</td>
                  <td className="p-2">#{r.material_id}</td>
                  <td className="p-2">#{r.warehouse_id}</td>
                  <td className="p-2">{r.movement_type}</td>
                  <td className="p-2 font-medium">{formatNum(r.quantity)}</td>
                  <td className="p-2">{formatNum(r.unit_cost)}</td>
                  <td className="p-2"><StatusBadge state={r.status} /></td>
                  <td className="p-2">{r.reference_type ?? "—"}{r.reference_id ? ` #${r.reference_id}` : ""}</td>
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
