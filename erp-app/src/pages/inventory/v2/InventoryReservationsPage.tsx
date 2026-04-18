import { useList, useSearchState, Pagination, StatusBadge, Loading, ErrorBox, EmptyBox, formatNum, formatDate } from "./_shared";

export default function InventoryReservationsPage() {
  const s = useSearchState({ limit: 50 });
  const { data, isLoading, error } = useList<any>(
    ["inventory", "reservations", s.state, s.offset],
    "/inventory/reservations",
    { state: s.state || undefined, limit: s.limit, offset: s.offset },
  );

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">שריוני מלאי</h1>
      <div className="flex gap-2 items-center">
        <select value={s.state} onChange={(e) => { s.setState(e.target.value); s.setOffset(0); }} className="rounded border px-2 py-2 text-sm">
          <option value="">כל המצבים</option>
          <option value="Reserved">משוריין</option>
          <option value="Released">שוחרר</option>
          <option value="Consumed">נוצל</option>
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
                <th className="p-2 text-right">חומר</th>
                <th className="p-2 text-right">מחסן</th>
                <th className="p-2 text-right">פרויקט</th>
                <th className="p-2 text-right">הזמנת עבודה</th>
                <th className="p-2 text-right">כמות</th>
                <th className="p-2 text-right">מצב</th>
                <th className="p-2 text-right">נוצר</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2">#{r.material_id}</td>
                  <td className="p-2">#{r.warehouse_id}</td>
                  <td className="p-2">{r.project_id ?? "—"}</td>
                  <td className="p-2">{r.work_order_id ?? "—"}</td>
                  <td className="p-2 font-medium">{formatNum(r.reserved_qty)}</td>
                  <td className="p-2"><StatusBadge state={r.state} /></td>
                  <td className="p-2">{formatDate(r.created_at)}</td>
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
