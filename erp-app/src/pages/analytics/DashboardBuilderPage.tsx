// Simple admin dashboard builder — view board + attached widgets,
// attach a new widget by ID. Full drag-drop builder is a future enhancement.
import { useParams, Link } from "wouter";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useDetail,
  useList,
  apiSend,
  Loading,
  ErrorBox,
  EmptyBox,
  PageHeader,
  formatNumber,
  formatDate,
} from "./_shared";

interface BoardWidget {
  id: number;
  widget_id: number;
  widget_code: string;
  widget_name: string;
  title: string;
  width_units: number;
  height_units: number;
  order_index: number;
  config_payload: unknown;
  data_source_type: string;
  data_source_ref: string | null;
}

interface Board {
  id: number;
  board_code: string;
  board_name: string;
  description: string | null;
  active: boolean;
  widgets: BoardWidget[];
  created_at: string;
  updated_at: string;
}

interface Widget {
  id: number;
  widget_code: string;
  widget_name: string;
  data_source_type: string;
}

export default function DashboardBuilderPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const qc = useQueryClient();
  const queryKey = ["analytics", "dashboard", id];
  const { data: board, isLoading, error } = useDetail<Board>(queryKey, `/dashboards/${id}`, Number.isFinite(id));
  const { data: widgetsData } = useList<Widget>(["analytics", "dashboard-widgets-list"], "/dashboard-widgets", { limit: 200 });
  const [widgetId, setWidgetId] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function attach() {
    if (!widgetId || !title) return;
    setBusy(true);
    setErr(null);
    try {
      await apiSend("POST", `/dashboards/${id}/widgets`, {
        widget_id: Number(widgetId),
        title,
      });
      setTitle("");
      setWidgetId("");
      qc.invalidateQueries({ queryKey: queryKey as any });
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function exportBoard(format: "csv" | "pdf") {
    setBusy(true);
    setErr(null);
    try {
      await apiSend("POST", `/dashboards/${id}/export`, { format });
      alert("הייצוא נשלח לתור העיבוד");
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!Number.isFinite(id)) {
    return (
      <div dir="rtl" className="p-6">
        <ErrorBox err="מזהה דשבורד לא תקין" />
      </div>
    );
  }
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox err={error} />;
  if (!board) return <EmptyBox />;

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <PageHeader
        title={board.board_name}
        actions={
          <div className="flex gap-2">
            <Link href="/dashboards" className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50">
              חזרה לרשימה
            </Link>
            <button
              className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50"
              disabled={busy}
              onClick={() => exportBoard("csv")}
            >
              ייצוא CSV
            </button>
            <button
              className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50"
              disabled={busy}
              onClick={() => exportBoard("pdf")}
            >
              ייצוא PDF
            </button>
          </div>
        }
      />

      <div className="rounded border bg-white p-4 text-sm space-y-1">
        <div>
          <b>קוד:</b> {board.board_code}
        </div>
        {board.description && (
          <div>
            <b>תיאור:</b> {board.description}
          </div>
        )}
        <div className="text-gray-500">עודכן: {formatDate(board.updated_at)}</div>
      </div>

      <div className="rounded border bg-white p-4 space-y-3">
        <h2 className="text-lg font-medium">צירוף ווידג'ט</h2>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={widgetId}
            onChange={(e) => setWidgetId(e.target.value)}
            className="rounded border px-2 py-2 text-sm min-w-[240px]"
          >
            <option value="">בחר ווידג'ט…</option>
            {widgetsData?.rows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.widget_name} ({w.widget_code})
              </option>
            ))}
          </select>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="כותרת במסך"
            className="rounded border px-3 py-2 text-sm"
          />
          <button
            className="rounded bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50"
            disabled={!widgetId || !title || busy}
            onClick={attach}
          >
            צרף
          </button>
        </div>
        {err && <div className="text-sm text-red-700">{err}</div>}
      </div>

      <div className="rounded border bg-white p-4">
        <h2 className="text-lg font-medium mb-2">ווידג'טים על הדשבורד</h2>
        {board.widgets.length === 0 ? (
          <EmptyBox label="עדיין לא מצורפים ווידג'טים לדשבורד זה" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {board.widgets.map((bw) => (
              <div key={bw.id} className="rounded border p-3 space-y-1 bg-gray-50">
                <div className="font-medium">{bw.title}</div>
                <div className="text-xs text-gray-600">
                  {bw.widget_name} · {bw.widget_code}
                </div>
                <div className="text-xs text-gray-500">
                  גודל: {formatNumber(bw.width_units)}×{formatNumber(bw.height_units)} · סדר: {bw.order_index}
                </div>
                <div className="text-xs text-gray-500">
                  מקור: {bw.data_source_type}
                  {bw.data_source_ref ? ` / ${bw.data_source_ref}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
