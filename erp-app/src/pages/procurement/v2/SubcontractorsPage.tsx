import { useList, useSearchState, SearchBar, Pagination, StatusBadge, Loading, ErrorBox, EmptyBox, formatDate, formatILS } from "./_shared";

export default function SubcontractorsPage() {
  const s = useSearchState({ limit: 50 });
  const { data, isLoading, error } = useList<any>(
    ["procurement", "subcontractors", s.q, s.state, s.offset],
    "/subcontractors",
    { q: s.q || undefined, status: s.state || undefined, limit: s.limit, offset: s.offset },
  );

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">קבלני משנה</h1>
      <div className="flex gap-2">
        <SearchBar value={s.q} onChange={(v) => { s.setQ(v); s.setOffset(0); }} placeholder="חיפוש לפי שם, מספר…" />
        <select value={s.state} onChange={(e) => { s.setState(e.target.value); s.setOffset(0); }} className="rounded border px-2 py-2 text-sm">
          <option value="">כל הסטטוסים</option>
          <option value="active">פעיל</option>
          <option value="inactive">לא פעיל</option>
          <option value="on_hold">מעוכב</option>
          <option value="blacklisted">חסום</option>
          <option value="pending_review">ממתין לבדיקה</option>
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
                <th className="p-2 text-right">מס׳</th>
                <th className="p-2 text-right">שם</th>
                <th className="p-2 text-right">התמחות</th>
                <th className="p-2 text-right">עיר</th>
                <th className="p-2 text-right">תוקף רישיון</th>
                <th className="p-2 text-right">תוקף ביטוח</th>
                <th className="p-2 text-right">תעריף יומי</th>
                <th className="p-2 text-right">פרויקטים פעילים</th>
                <th className="p-2 text-right">סיכון</th>
                <th className="p-2 text-right">סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2 font-medium">{r.subcontractor_number}</td>
                  <td className="p-2">{r.legal_name}</td>
                  <td className="p-2">{r.specialty ?? "—"}</td>
                  <td className="p-2">{r.city ?? "—"}</td>
                  <td className="p-2">{formatDate(r.license_expiry)}</td>
                  <td className="p-2">{formatDate(r.insurance_expiry)}</td>
                  <td className="p-2">{formatILS(r.day_rate)}</td>
                  <td className="p-2">{r.active_projects_count ?? 0}</td>
                  <td className="p-2 text-xs">{r.risk_level ?? "—"}</td>
                  <td className="p-2"><StatusBadge state={r.status} /></td>
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
