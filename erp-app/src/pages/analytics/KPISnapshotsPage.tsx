import {
  useList,
  useSearchState,
  SearchBar,
  Pagination,
  Loading,
  ErrorBox,
  EmptyBox,
  PageHeader,
  formatDate,
  formatNumber,
} from "./_shared";

interface Snapshot {
  id: number;
  kpi_name: string;
  snapshot_date: string;
  value: number;
  target_value: number | null;
  comparison_result: string | null;
  created_at: string;
}

export default function KPISnapshotsPage() {
  const s = useSearchState({ limit: 50 });
  const queryKey = ["analytics", "kpi-snapshots", s.q, s.state, s.offset];
  const { data, isLoading, error } = useList<Snapshot>(queryKey, "/kpi-snapshots", {
    q: s.q || undefined,
    kpi_name: s.state || undefined,
    limit: s.limit,
    offset: s.offset,
  });

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <PageHeader title="סנאפשוטים של KPI" />
      <div className="flex gap-2 items-center">
        <SearchBar
          value={s.q}
          onChange={(v) => {
            s.setQ(v);
            s.setOffset(0);
          }}
          placeholder="חיפוש לפי שם KPI…"
        />
        <input
          value={s.state}
          onChange={(e) => {
            s.setState(e.target.value);
            s.setOffset(0);
          }}
          placeholder="שם KPI"
          className="rounded border px-2 py-2 text-sm"
        />
      </div>
      {isLoading && <Loading />}
      {error && <ErrorBox err={error} />}
      {data && data.rows.length === 0 && <EmptyBox label="אין סנאפשוטים" />}
      {data && data.rows.length > 0 && (
        <div className="overflow-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 text-right">KPI</th>
                <th className="p-2 text-right">תאריך סנאפשוט</th>
                <th className="p-2 text-right">ערך</th>
                <th className="p-2 text-right">יעד</th>
                <th className="p-2 text-right">תוצאה</th>
                <th className="p-2 text-right">נוצר</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2 font-medium">{r.kpi_name}</td>
                  <td className="p-2">{formatDate(r.snapshot_date)}</td>
                  <td className="p-2">{formatNumber(r.value)}</td>
                  <td className="p-2">{formatNumber(r.target_value)}</td>
                  <td className="p-2">{r.comparison_result ?? "—"}</td>
                  <td className="p-2 text-gray-500">{formatDate(r.created_at)}</td>
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
