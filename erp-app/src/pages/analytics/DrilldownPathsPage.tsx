import {
  useList,
  useSearchState,
  SearchBar,
  Pagination,
  StatusBadge,
  Loading,
  ErrorBox,
  EmptyBox,
  PageHeader,
  formatDate,
} from "./_shared";

interface Path {
  id: string;
  path_code: string;
  path_label_he: string | null;
  from_entity: string;
  to_entity: string;
  link_field: string | null;
  is_active: boolean;
  updated_at: string;
}

export default function DrilldownPathsPage() {
  const s = useSearchState({ limit: 50 });
  const queryKey = ["analytics", "drilldown-paths", s.q, s.state, s.offset];
  const { data, isLoading, error } = useList<Path>(queryKey, "/drilldown-paths", {
    q: s.q || undefined,
    from_entity: s.state || undefined,
    limit: s.limit,
    offset: s.offset,
  });

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <PageHeader title="מסלולי Drilldown" />
      <div className="flex gap-2 items-center">
        <SearchBar
          value={s.q}
          onChange={(v) => {
            s.setQ(v);
            s.setOffset(0);
          }}
          placeholder="חיפוש לפי קוד / תווית…"
        />
        <input
          value={s.state}
          onChange={(e) => {
            s.setState(e.target.value);
            s.setOffset(0);
          }}
          placeholder="ישות מקור"
          className="rounded border px-2 py-2 text-sm"
        />
      </div>
      {isLoading && <Loading />}
      {error && <ErrorBox err={error} />}
      {data && data.rows.length === 0 && <EmptyBox label="אין מסלולים" />}
      {data && data.rows.length > 0 && (
        <div className="overflow-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 text-right">קוד</th>
                <th className="p-2 text-right">תווית</th>
                <th className="p-2 text-right">ממקור</th>
                <th className="p-2 text-right">ליעד</th>
                <th className="p-2 text-right">שדה קישור</th>
                <th className="p-2 text-right">סטטוס</th>
                <th className="p-2 text-right">עודכן</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2 font-medium">{r.path_code}</td>
                  <td className="p-2">{r.path_label_he ?? "—"}</td>
                  <td className="p-2">{r.from_entity}</td>
                  <td className="p-2">{r.to_entity}</td>
                  <td className="p-2 text-gray-600">{r.link_field ?? "—"}</td>
                  <td className="p-2">
                    <StatusBadge state={r.is_active ? "active" : "skipped"} />
                  </td>
                  <td className="p-2 text-gray-500">{formatDate(r.updated_at)}</td>
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
