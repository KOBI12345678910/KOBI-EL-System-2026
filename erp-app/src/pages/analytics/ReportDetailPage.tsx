import { useParams, Link } from "wouter";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useDetail,
  apiSend,
  Loading,
  ErrorBox,
  EmptyBox,
  PageHeader,
  StatusBadge,
  formatDate,
  formatNumber,
} from "./_shared";

interface Run {
  id: string;
  status: string;
  parameters: unknown;
  output_uri: string | null;
  row_count: number | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  created_at: string;
}

interface Report {
  id: string;
  report_code: string;
  report_name: string;
  report_label_he: string | null;
  description: string | null;
  category: string | null;
  output_format: string;
  source_table: string | null;
  is_active: boolean;
  parameters_schema: unknown;
  recent_runs: Run[];
  updated_at: string;
}

export default function ReportDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const queryKey = ["analytics", "report", id];
  const { data, isLoading, error } = useDetail<Report>(queryKey, `/reports/${id}`, !!id);
  const [paramsJson, setParamsJson] = useState<string>("{}");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function runNow() {
    setBusy(true);
    setErr(null);
    try {
      let parsed: unknown = {};
      try {
        parsed = JSON.parse(paramsJson || "{}");
      } catch {
        throw new Error("JSON של פרמטרים לא תקין");
      }
      await apiSend("POST", `/reports/${id}/run`, { parameters: parsed });
      qc.invalidateQueries({ queryKey: queryKey as any });
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!id) {
    return (
      <div dir="rtl" className="p-6">
        <ErrorBox err="חסר מזהה דוח" />
      </div>
    );
  }
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox err={error} />;
  if (!data) return <EmptyBox />;

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <PageHeader
        title={data.report_name}
        actions={
          <Link href="/reports" className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50">
            חזרה לרשימה
          </Link>
        }
      />

      <div className="rounded border bg-white p-4 text-sm space-y-1">
        <div>
          <b>קוד:</b> {data.report_code}
        </div>
        {data.report_label_he && (
          <div>
            <b>תווית:</b> {data.report_label_he}
          </div>
        )}
        {data.description && (
          <div>
            <b>תיאור:</b> {data.description}
          </div>
        )}
        <div>
          <b>קטגוריה:</b> {data.category ?? "—"}
        </div>
        <div>
          <b>פורמט פלט:</b> {data.output_format}
        </div>
        {data.source_table && (
          <div>
            <b>טבלת מקור:</b> {data.source_table}
          </div>
        )}
        <div className="text-gray-500">עודכן: {formatDate(data.updated_at)}</div>
      </div>

      <div className="rounded border bg-white p-4 space-y-3">
        <h2 className="text-lg font-medium">הרצת דוח</h2>
        <textarea
          value={paramsJson}
          onChange={(e) => setParamsJson(e.target.value)}
          placeholder='{"from_date":"2026-01-01"}'
          dir="ltr"
          className="w-full h-28 rounded border px-3 py-2 text-sm font-mono"
        />
        <div className="flex gap-2 items-center">
          <button
            className="rounded bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50"
            disabled={busy}
            onClick={runNow}
          >
            הרץ כעת
          </button>
          {err && <div className="text-sm text-red-700">{err}</div>}
        </div>
      </div>

      <div className="rounded border bg-white p-4">
        <h2 className="text-lg font-medium mb-2">ריצות אחרונות</h2>
        {data.recent_runs.length === 0 ? (
          <EmptyBox label="עדיין לא רצו ריצות לדוח זה" />
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2 text-right">סטטוס</th>
                  <th className="p-2 text-right">שורות</th>
                  <th className="p-2 text-right">התחיל</th>
                  <th className="p-2 text-right">סיים</th>
                  <th className="p-2 text-right">משך (ms)</th>
                  <th className="p-2 text-right">שגיאה</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_runs.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2">
                      <StatusBadge state={r.status} />
                    </td>
                    <td className="p-2">{formatNumber(r.row_count)}</td>
                    <td className="p-2 text-gray-500">{formatDate(r.started_at)}</td>
                    <td className="p-2 text-gray-500">{formatDate(r.finished_at)}</td>
                    <td className="p-2">{formatNumber(r.duration_ms)}</td>
                    <td className="p-2 text-red-700">{r.error_message ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
