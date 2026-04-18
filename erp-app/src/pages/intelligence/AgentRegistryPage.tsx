import { useList, useSearchState, SearchBar, Pagination, StatusBadge, Loading, ErrorBox, EmptyBox, PageHeader, formatDate } from "./_shared";

export default function AgentRegistryPage() {
  const s = useSearchState({ limit: 50 });
  const { data, isLoading, error } = useList<any>(
    ["intelligence", "agents", s.q, s.state, s.offset],
    "/agents",
    { q: s.q || undefined, status: s.state || undefined, limit: s.limit, offset: s.offset },
  );

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <PageHeader title="רישום סוכנים (ניהול)" />
      <div className="flex gap-2 items-center">
        <SearchBar value={s.q} onChange={(v) => { s.setQ(v); s.setOffset(0); }} placeholder="חיפוש לפי קוד/שם סוכן…" />
        <select value={s.state} onChange={(e) => { s.setState(e.target.value); s.setOffset(0); }} className="rounded border px-2 py-2 text-sm">
          <option value="">כל הסטטוסים</option>
          <option value="healthy">תקין</option>
          <option value="degraded">מידל</option>
          <option value="failed">כשל</option>
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
                <th className="p-2 text-right">קוד</th>
                <th className="p-2 text-right">שם</th>
                <th className="p-2 text-right">סטטוס</th>
                <th className="p-2 text-right">פעימה אחרונה</th>
                <th className="p-2 text-right">עודכן</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2 font-mono">{r.agent_code}</td>
                  <td className="p-2 font-medium">{r.agent_name}</td>
                  <td className="p-2"><StatusBadge state={r.status} /></td>
                  <td className="p-2">{formatDate(r.last_heartbeat_at)}</td>
                  <td className="p-2">{formatDate(r.updated_at)}</td>
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
