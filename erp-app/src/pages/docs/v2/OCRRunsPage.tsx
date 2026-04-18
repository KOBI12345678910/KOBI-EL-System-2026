import { useList, useSearchState, Pagination, Loading, ErrorBox, EmptyBox, StatusBadge, formatDate } from "./_shared";

export default function OCRRunsPage() {
  const s = useSearchState({ limit: 50 });
  const { data, isLoading, error } = useList<any>(
    ["docs", "ocr-runs", s.state, s.offset],
    "/ocr-runs",
    { status: s.state || undefined, limit: s.limit, offset: s.offset },
  );
  return (
    <div dir="rtl" className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">ריצות OCR</h1>
      <div className="flex gap-2 items-center">
        <select value={s.state} onChange={(e) => { s.setState(e.target.value); s.setOffset(0); }} className="rounded border px-2 py-2 text-sm">
          <option value="">כל הסטטוסים</option>
          <option value="queued">בתור</option>
          <option value="running">רץ</option>
          <option value="complete">הושלם</option>
          <option value="failed">נכשל</option>
        </select>
      </div>
      {isLoading && <Loading />}
      {error && <ErrorBox err={error} />}
      {data && data.rows.length === 0 && <EmptyBox />}
      {data && data.rows.length > 0 && (
        <div className="overflow-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-gray-100"><tr>
              <th className="p-2 text-right">#</th>
              <th className="p-2 text-right">מסמך</th>
              <th className="p-2 text-right">ספק</th>
              <th className="p-2 text-right">סטטוס</th>
              <th className="p-2 text-right">דפים</th>
              <th className="p-2 text-right">ביטחון</th>
              <th className="p-2 text-right">התחיל</th>
              <th className="p-2 text-right">הסתיים</th>
            </tr></thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2">{r.id}</td>
                  <td className="p-2">{r.document_id}</td>
                  <td className="p-2">{r.provider ?? "—"}</td>
                  <td className="p-2"><StatusBadge state={r.status} /></td>
                  <td className="p-2">{r.pages_processed ?? "—"}</td>
                  <td className="p-2">{r.confidence_avg ?? "—"}</td>
                  <td className="p-2">{formatDate(r.started_at)}</td>
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
