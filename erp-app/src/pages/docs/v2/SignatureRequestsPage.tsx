import { useList, useSearchState, SearchBar, Pagination, Loading, ErrorBox, EmptyBox, StatusBadge, formatDate } from "./_shared";

export default function SignatureRequestsPage() {
  const s = useSearchState({ limit: 50 });
  const { data, isLoading, error } = useList<any>(
    ["docs", "sig-reqs", s.q, s.state, s.offset],
    "/signature-requests",
    { q: s.q || undefined, status: s.state || undefined, limit: s.limit, offset: s.offset },
  );
  return (
    <div dir="rtl" className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">בקשות חתימה</h1>
      <div className="flex gap-2 items-center">
        <SearchBar value={s.q} onChange={(v) => { s.setQ(v); s.setOffset(0); }} placeholder="חיפוש מספר בקשה…" />
        <select value={s.state} onChange={(e) => { s.setState(e.target.value); s.setOffset(0); }} className="rounded border px-2 py-2 text-sm">
          <option value="">כל הסטטוסים</option>
          <option value="sent">נשלח</option>
          <option value="partially_signed">חתימה חלקית</option>
          <option value="signed">נחתם</option>
          <option value="declined">סורב</option>
          <option value="expired">פג תוקף</option>
        </select>
      </div>
      {isLoading && <Loading />}
      {error && <ErrorBox err={error} />}
      {data && data.rows.length === 0 && <EmptyBox />}
      {data && data.rows.length > 0 && (
        <div className="overflow-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-gray-100"><tr>
              <th className="p-2 text-right">מספר</th>
              <th className="p-2 text-right">מסמך</th>
              <th className="p-2 text-right">ספק</th>
              <th className="p-2 text-right">סטטוס</th>
              <th className="p-2 text-right">חתמו</th>
              <th className="p-2 text-right">מתוך</th>
              <th className="p-2 text-right">נשלח</th>
              <th className="p-2 text-right">הסתיים</th>
            </tr></thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2 font-medium">{r.request_number}</td>
                  <td className="p-2">{r.document_id}</td>
                  <td className="p-2">{r.provider ?? "—"}</td>
                  <td className="p-2"><StatusBadge state={r.status} /></td>
                  <td className="p-2">{r.signed_count}</td>
                  <td className="p-2">{r.total_signers}</td>
                  <td className="p-2">{formatDate(r.sent_at)}</td>
                  <td className="p-2">{formatDate(r.completed_at)}</td>
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
