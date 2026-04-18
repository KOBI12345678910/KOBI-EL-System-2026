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
  formatNumber,
} from "./_shared";

interface KpiDef {
  id: string;
  kpi_name: string;
  kpi_label_he: string | null;
  unit: string | null;
  target_value: number | null;
  comparison_type: string;
  category: string | null;
  data_source_table: string | null;
  is_active: boolean;
  updated_at: string;
}

export default function KPIDefinitionsPage() {
  const s = useSearchState({ limit: 50 });
  const qc = useQueryClient();
  const queryKey = ["analytics", "kpi-definitions", s.q, s.state, s.offset];
  const { data, isLoading, error } = useList<KpiDef>(queryKey, "/kpi-definitions", {
    q: s.q || undefined,
    category: s.state || undefined,
    limit: s.limit,
    offset: s.offset,
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function compute(id: string) {
    setBusyId(id);
    setErr(null);
    try {
      await apiSend("POST", `/kpi-definitions/${id}/compute`, {});
      qc.invalidateQueries({ queryKey: queryKey as any });
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <PageHeader title="הגדרות KPI" />
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
          placeholder="קטגוריה"
          className="rounded border px-2 py-2 text-sm"
        />
      </div>
      {err && <div className="text-sm text-red-700">{err}</div>}
      {isLoading && <Loading />}
      {error && <ErrorBox err={error} />}
      {data && data.rows.length === 0 && <EmptyBox label="אין הגדרות KPI" />}
      {data && data.rows.length > 0 && (
        <div className="overflow-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 text-right">שם KPI</th>
                <th className="p-2 text-right">תווית</th>
                <th className="p-2 text-right">יחידה</th>
                <th className="p-2 text-right">יעד</th>
                <th className="p-2 text-right">השוואה</th>
                <th className="p-2 text-right">קטגוריה</th>
                <th className="p-2 text-right">מקור</th>
                <th className="p-2 text-right">סטטוס</th>
                <th className="p-2 text-right">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2 font-medium">{r.kpi_name}</td>
                  <td className="p-2">{r.kpi_label_he ?? "—"}</td>
                  <td className="p-2">{r.unit ?? "—"}</td>
                  <td className="p-2">{formatNumber(r.target_value)}</td>
                  <td className="p-2">
                    <StatusBadge state={r.comparison_type} />
                  </td>
                  <td className="p-2">{r.category ?? "—"}</td>
                  <td className="p-2 text-gray-600">{r.data_source_table ?? "—"}</td>
                  <td className="p-2">
                    <StatusBadge state={r.is_active ? "active" : "skipped"} />
                  </td>
                  <td className="p-2">
                    <button
                      onClick={() => compute(r.id)}
                      disabled={busyId === r.id}
                      className="text-indigo-700 hover:underline disabled:opacity-50"
                    >
                      חישוב
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
