import { useList, useSearchState, Pagination, StatusBadge, Loading, ErrorBox, EmptyBox, formatNum, formatDate } from "./_shared";

export default function ShortageSnapshotsPage() {
  const s = useSearchState({ limit: 50 });
  const { data, isLoading, error } = useList<any>(
    ["inventory", "shortages", s.state, s.offset],
    "/shortage-snapshots",
    { severity: s.state || undefined, limit: s.limit, offset: s.offset },
  );

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">תמונות מחסור</h1>
      <div className="flex gap-2 items-center">
        <select value={s.state} onChange={(e) => { s.setState(e.target.value); s.setOffset(0); }} className="rounded border px-2 py-2 text-sm">
          <option value="">כל הרמות</option>
          <option value="info">מידע</option>
          <option value="warn">אזהרה</option>
          <option value="critical">קריטי</option>
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
                <th className="p-2 text-right">תאריך</th>
                <th className="p-2 text-right">במלאי</th>
                <th className="p-2 text-right">משוריין</th>
                <th className="p-2 text-right">זמין</th>
                <th className="p-2 text-right">נדרש</th>
                <th className="p-2 text-right">מחסור</th>
                <th className="p-2 text-right">חומרה</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2">#{r.material_id}</td>
                  <td className="p-2">{r.warehouse_id ?? "הכל"}</td>
                  <td className="p-2">{formatDate(r.snapshot_at)}</td>
                  <td className="p-2">{formatNum(r.on_hand_qty)}</td>
                  <td className="p-2">{formatNum(r.reserved_qty)}</td>
                  <td className="p-2">{formatNum(r.available_qty)}</td>
                  <td className="p-2">{formatNum(r.required_qty)}</td>
                  <td className="p-2 font-medium text-red-700">{formatNum(r.shortage_qty)}</td>
                  <td className="p-2"><StatusBadge state={r.severity} /></td>
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
