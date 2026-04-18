import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useList,
  useSearchState,
  apiSend,
  SearchBar,
  Pagination,
  StatusBadge,
  Loading,
  ErrorBox,
  EmptyBox,
  PageHeader,
  formatDate,
} from "./_shared";

interface Invalidation {
  id: number;
  read_model_name: string;
  trigger_reason: string | null;
  status: string;
  retry_count: number;
  error_message: string | null;
  processed_at: string | null;
  created_at: string;
}

export default function ReadModelInvalidationsPage() {
  const s = useSearchState({ limit: 50 });
  const qc = useQueryClient();
  const queryKey = ["analytics", "read-model-invalidations", s.q, s.state, s.offset];
  const { data, isLoading, error } = useList<Invalidation>(queryKey, "/read-model-invalidations", {
    q: s.q || undefined,
    status: s.state || undefined,
    limit: s.limit,
    offset: s.offset,
  });
  const [busyId, setBusyId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function reprocess(id: number) {
    setBusyId(id);
    setErr(null);
    try {
      await apiSend("POST", `/read-model-invalidations/${id}/reprocess`, {
        reason: "manual-reprocess",
      });
      qc.invalidateQueries({ queryKey: queryKey as any });
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <PageHeader title="חידוש מודל קריאה" />
      <div className="flex gap-2 items-center">
        <SearchBar
          value={s.q}
          onChange={(v) => {
            s.setQ(v);
            s.setOffset(0);
          }}
          placeholder="חיפוש לפי שם read-model…"
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
          <option value="pending">ממתין</option>
          <option value="processed">עובד</option>
          <option value="skipped">דולג</option>
        </select>
      </div>
      {err && <div className="text-sm text-red-700">{err}</div>}
      {isLoading && <Loading />}
      {error && <ErrorBox err={error} />}
      {data && data.rows.length === 0 && <EmptyBox label="אין בקשות חידוש" />}
      {data && data.rows.length > 0 && (
        <div className="overflow-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 text-right">#</th>
                <th className="p-2 text-right">Read-Model</th>
                <th className="p-2 text-right">סיבה</th>
                <th className="p-2 text-right">סטטוס</th>
                <th className="p-2 text-right">ניסיונות</th>
                <th className="p-2 text-right">עובד ב-</th>
                <th className="p-2 text-right">נוצר</th>
                <th className="p-2 text-right">שגיאה</th>
                <th className="p-2 text-right">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2">{r.id}</td>
                  <td className="p-2 font-medium">{r.read_model_name}</td>
                  <td className="p-2">{r.trigger_reason ?? "—"}</td>
                  <td className="p-2">
                    <StatusBadge state={r.status} />
                  </td>
                  <td className="p-2">{r.retry_count}</td>
                  <td className="p-2 text-gray-500">{formatDate(r.processed_at)}</td>
                  <td className="p-2 text-gray-500">{formatDate(r.created_at)}</td>
                  <td className="p-2 text-red-700">{r.error_message ?? "—"}</td>
                  <td className="p-2">
                    <button
                      onClick={() => reprocess(r.id)}
                      disabled={busyId === r.id}
                      className="text-indigo-700 hover:underline disabled:opacity-50"
                    >
                      חדש עיבוד
                    </button>
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
