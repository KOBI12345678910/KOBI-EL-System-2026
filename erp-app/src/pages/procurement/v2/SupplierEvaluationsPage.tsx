import { useList, useSearchState, SearchBar, Pagination, StatusBadge, Loading, ErrorBox, EmptyBox, formatDate } from "./_shared";

export default function SupplierEvaluationsPage() {
  const s = useSearchState({ limit: 50 });
  const { data, isLoading, error } = useList<any>(
    ["procurement", "supplier-evaluations", s.q, s.state, s.offset],
    "/supplier-evaluations",
    { q: s.q || undefined, state: s.state || undefined, limit: s.limit, offset: s.offset },
  );

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">הערכות ספקים</h1>
      <div className="flex gap-2">
        <SearchBar value={s.q} onChange={(v) => { s.setQ(v); s.setOffset(0); }} placeholder="חיפוש לפי מספר הערכה…" />
        <select value={s.state} onChange={(e) => { s.setState(e.target.value); s.setOffset(0); }} className="rounded border px-2 py-2 text-sm">
          <option value="">כל הסטטוסים</option>
          <option value="draft">טיוטה</option>
          <option value="submitted">הוגשה</option>
          <option value="approved">אושרה</option>
          <option value="archived">בארכיון</option>
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
                <th className="p-2 text-right">מס׳ הערכה</th>
                <th className="p-2 text-right">ספק</th>
                <th className="p-2 text-right">תקופה</th>
                <th className="p-2 text-right">אספקה</th>
                <th className="p-2 text-right">איכות</th>
                <th className="p-2 text-right">מחיר</th>
                <th className="p-2 text-right">שירות</th>
                <th className="p-2 text-right">תקשורת</th>
                <th className="p-2 text-right">ציות</th>
                <th className="p-2 text-right">כללי</th>
                <th className="p-2 text-right">ציון</th>
                <th className="p-2 text-right">המלצה</th>
                <th className="p-2 text-right">סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2 font-medium">{r.evaluation_number}</td>
                  <td className="p-2">{r.supplier_id}</td>
                  <td className="p-2 text-xs">{formatDate(r.evaluation_period_start)}—{formatDate(r.evaluation_period_end)}</td>
                  <td className="p-2">{r.delivery_score ?? "—"}</td>
                  <td className="p-2">{r.quality_score ?? "—"}</td>
                  <td className="p-2">{r.price_score ?? "—"}</td>
                  <td className="p-2">{r.service_score ?? "—"}</td>
                  <td className="p-2">{r.communication_score ?? "—"}</td>
                  <td className="p-2">{r.compliance_score ?? "—"}</td>
                  <td className="p-2 font-semibold">{r.overall_score ?? "—"}</td>
                  <td className="p-2">{r.grade ?? "—"}</td>
                  <td className="p-2 text-xs">{r.recommendation ?? "—"}</td>
                  <td className="p-2"><StatusBadge state={r.state} /></td>
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
