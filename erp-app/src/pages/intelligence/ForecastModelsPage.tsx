import { useState } from "react";
import { useList, useDetail, useSearchState, SearchBar, Pagination, StatusBadge, Loading, ErrorBox, EmptyBox, PageHeader, formatDate } from "./_shared";

export default function ForecastModelsPage() {
  const s = useSearchState({ limit: 50 });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const queryKey = ["intelligence", "forecast-models", s.q, s.offset];
  const { data, isLoading, error } = useList<any>(queryKey, "/forecast-models", {
    q: s.q || undefined, limit: s.limit, offset: s.offset,
  });
  const execs = useDetail<any>(["intelligence", "forecast-executions", selectedId ?? 0], `/forecast-models/${selectedId}/executions`, !!selectedId);

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <PageHeader title="מודלי תחזיות" />
      <div className="flex gap-2 items-center">
        <SearchBar value={s.q} onChange={(v) => { s.setQ(v); s.setOffset(0); }} placeholder="חיפוש לפי מספר/תחום…" />
      </div>
      {isLoading && <Loading />}
      {error && <ErrorBox err={error} />}
      {data && data.rows.length === 0 && <EmptyBox />}
      {data && data.rows.length > 0 && (
        <div className="overflow-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 text-right">מספר</th>
                <th className="p-2 text-right">תחום</th>
                <th className="p-2 text-right">תקופה</th>
                <th className="p-2 text-right">גרסה</th>
                <th className="p-2 text-right">סטטוס</th>
                <th className="p-2 text-right">נוצר</th>
                <th className="p-2 text-right">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2 font-medium">{r.model_number}</td>
                  <td className="p-2">{r.forecast_domain}</td>
                  <td className="p-2">{r.period_start ?? "—"} → {r.period_end ?? "—"}</td>
                  <td className="p-2">{r.model_version ?? "—"}</td>
                  <td className="p-2"><StatusBadge state={r.state} /></td>
                  <td className="p-2">{formatDate(r.created_at)}</td>
                  <td className="p-2">
                    <button className="text-indigo-700 hover:underline" onClick={() => setSelectedId(r.id)}>הצג ביצועים</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination offset={s.offset} limit={s.limit} total={data?.total} onChange={s.setOffset} />

      {selectedId && (
        <div className="rounded border p-4 bg-gray-50">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">ביצועי מודל #{selectedId}</h2>
            <button className="text-sm text-gray-600 hover:underline" onClick={() => setSelectedId(null)}>סגור</button>
          </div>
          {execs.isLoading && <Loading />}
          {execs.error && <ErrorBox err={execs.error} />}
          {execs.data && execs.data.rows?.length === 0 && <EmptyBox label="אין ביצועים למודל זה" />}
          {execs.data && execs.data.rows?.length > 0 && (
            <div className="overflow-auto rounded border bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-2 text-right">מזהה</th>
                    <th className="p-2 text-right">סוג</th>
                    <th className="p-2 text-right">סטטוס</th>
                    <th className="p-2 text-right">התחלה</th>
                    <th className="p-2 text-right">סיום</th>
                  </tr>
                </thead>
                <tbody>
                  {execs.data.rows.map((e: any) => (
                    <tr key={e.id} className="border-t">
                      <td className="p-2">{e.id}</td>
                      <td className="p-2">{e.execution_type}</td>
                      <td className="p-2"><StatusBadge state={e.status} /></td>
                      <td className="p-2">{formatDate(e.started_at)}</td>
                      <td className="p-2">{formatDate(e.finished_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
