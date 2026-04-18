import { Link } from "wouter";
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

interface Board {
  id: number;
  board_code: string;
  board_name: string;
  description: string | null;
  active: boolean;
  is_active?: boolean;
  created_at: string;
  updated_at: string;
}

export default function DashboardsListPage() {
  const s = useSearchState({ limit: 50 });
  const queryKey = ["analytics", "dashboards", s.q, s.state, s.offset];
  const { data, isLoading, error } = useList<Board>(queryKey, "/dashboards", {
    q: s.q || undefined,
    is_active: s.state || undefined,
    limit: s.limit,
    offset: s.offset,
  });

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <PageHeader title="דשבורדים" />
      <div className="flex gap-2 items-center">
        <SearchBar
          value={s.q}
          onChange={(v) => {
            s.setQ(v);
            s.setOffset(0);
          }}
          placeholder="חיפוש לפי קוד או שם דשבורד…"
        />
        <select
          value={s.state}
          onChange={(e) => {
            s.setState(e.target.value);
            s.setOffset(0);
          }}
          className="rounded border px-2 py-2 text-sm"
        >
          <option value="">כל הסטטוסים</option>
          <option value="true">פעיל</option>
          <option value="false">לא פעיל</option>
        </select>
      </div>
      {isLoading && <Loading />}
      {error && <ErrorBox err={error} />}
      {data && data.rows.length === 0 && <EmptyBox label="אין דשבורדים להצגה" />}
      {data && data.rows.length > 0 && (
        <div className="overflow-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 text-right">קוד</th>
                <th className="p-2 text-right">שם</th>
                <th className="p-2 text-right">תיאור</th>
                <th className="p-2 text-right">סטטוס</th>
                <th className="p-2 text-right">עודכן</th>
                <th className="p-2 text-right">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2 font-medium">{r.board_code}</td>
                  <td className="p-2">{r.board_name}</td>
                  <td className="p-2 text-gray-600">{r.description ?? "—"}</td>
                  <td className="p-2">
                    <StatusBadge state={(r.active ?? r.is_active) ? "active" : "skipped"} />
                  </td>
                  <td className="p-2 text-gray-500">{formatDate(r.updated_at)}</td>
                  <td className="p-2">
                    <Link href={`/dashboards/${r.id}`} className="text-indigo-700 hover:underline">
                      פתח
                    </Link>
                  </td>
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
