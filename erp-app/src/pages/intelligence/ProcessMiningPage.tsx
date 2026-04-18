import { useList, Loading, ErrorBox, EmptyBox, PageHeader, StatusBadge, formatDate } from "./_shared";

export default function ProcessMiningPage() {
  const insights = useList<any>(["intelligence", "proc-mining", "insights"], "/ai-insights", { limit: 20 });
  const anomalies = useList<any>(["intelligence", "proc-mining", "anomalies"], "/anomaly-cases", { limit: 20 });
  const trends = useList<any>(["intelligence", "proc-mining", "trends"], "/trend-signals", { limit: 20 });
  const execs = useList<any>(["intelligence", "proc-mining", "execs"], "/model-executions", { limit: 20 });

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <PageHeader title="חציבת תהליכים (דשבורד לקריאה בלבד)" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="rounded border p-4">
          <h2 className="font-semibold mb-2">תובנות AI אחרונות</h2>
          {insights.isLoading && <Loading />}
          {insights.error && <ErrorBox err={insights.error} />}
          {insights.data && insights.data.rows.length === 0 && <EmptyBox />}
          {insights.data && insights.data.rows.length > 0 && (
            <ul className="space-y-1 text-sm">
              {insights.data.rows.map((r: any) => (
                <li key={r.id} className="flex items-center gap-2 justify-between">
                  <span className="truncate">{r.insight_number} — {r.category ?? "—"}</span>
                  <StatusBadge state={r.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded border p-4">
          <h2 className="font-semibold mb-2">אנומליות אחרונות</h2>
          {anomalies.isLoading && <Loading />}
          {anomalies.error && <ErrorBox err={anomalies.error} />}
          {anomalies.data && anomalies.data.rows.length === 0 && <EmptyBox />}
          {anomalies.data && anomalies.data.rows.length > 0 && (
            <ul className="space-y-1 text-sm">
              {anomalies.data.rows.map((r: any) => (
                <li key={r.id} className="flex items-center gap-2 justify-between">
                  <span className="truncate">{r.anomaly_number} — {r.anomaly_type}</span>
                  <StatusBadge state={r.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded border p-4">
          <h2 className="font-semibold mb-2">אותות מגמה</h2>
          {trends.isLoading && <Loading />}
          {trends.error && <ErrorBox err={trends.error} />}
          {trends.data && trends.data.rows.length === 0 && <EmptyBox />}
          {trends.data && trends.data.rows.length > 0 && (
            <ul className="space-y-1 text-sm">
              {trends.data.rows.map((r: any) => (
                <li key={r.id} className="flex items-center gap-2 justify-between">
                  <span className="truncate">{r.signal_type}</span>
                  <span className="font-mono">{r.signal_value != null ? Number(r.signal_value).toFixed(2) : "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded border p-4">
          <h2 className="font-semibold mb-2">ביצועי מודלים אחרונים</h2>
          {execs.isLoading && <Loading />}
          {execs.error && <ErrorBox err={execs.error} />}
          {execs.data && execs.data.rows.length === 0 && <EmptyBox />}
          {execs.data && execs.data.rows.length > 0 && (
            <ul className="space-y-1 text-sm">
              {execs.data.rows.map((r: any) => (
                <li key={r.id} className="flex items-center gap-2 justify-between">
                  <span className="truncate">#{r.id} — {r.execution_type}</span>
                  <span className="text-xs text-gray-500">{formatDate(r.started_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
