import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";

interface OperationsData {
  summary: Record<string, any>;
  active_work_orders: any[];
  delayed_work_orders: any[];
  open_tasks: any[];
  shortages: any[];
  logistics_orders: any[];
  alerts: any[];
  project_rows: any[];
}

export default function OperationsControlRoom() {
  const [data, setData] = useState<OperationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: payload, error: err } = await supabase.rpc(
        "get_operations_control_room_fast"
      );
      if (err) setError(err.message);
      else setData(payload);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <Loading label="טוען חדר בקרה תפעולי..." />;
  if (error) return <ErrorCard message={error} />;
  if (!data) return null;

  const s = data.summary ?? {};

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">חדר בקרה — תפעול</h1>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="הזמנות פעילות" value={s.active_work_orders_count ?? data.active_work_orders.length} />
        <KPI label="באיחור" value={data.delayed_work_orders.length} color="red" />
        <KPI label="משימות פתוחות" value={data.open_tasks.length} />
        <KPI label="מחסור חומרים" value={data.shortages.length} color={data.shortages.length > 0 ? "yellow" : "green"} />
      </div>

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <Section title="התראות פתוחות">
          <div className="space-y-2">
            {data.alerts.slice(0, 10).map((a: any) => (
              <div
                key={a.id}
                className={`p-3 rounded border text-sm ${
                  a.severity === "Critical"
                    ? "border-red-500/40 bg-red-900/20"
                    : "border-yellow-500/30 bg-yellow-900/10"
                }`}
              >
                <span className="font-medium">{a.title}</span>
                <span className="text-gray-400 mr-2 text-xs">#{a.alert_number}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Delayed Work Orders */}
      {data.delayed_work_orders.length > 0 && (
        <Section title="הזמנות באיחור">
          <Table
            rows={data.delayed_work_orders}
            columns={[
              { key: "wo_number", label: "מספר" },
              { key: "project_name", label: "פרויקט" },
              { key: "state", label: "סטטוס" },
              { key: "required_end_date", label: "תאריך יעד" },
            ]}
            onRowClick={(row) => navigate(`/work-order/${row.work_order_id}`)}
          />
        </Section>
      )}

      {/* Active Work Orders */}
      <Section title="הזמנות עבודה פעילות">
        <Table
          rows={data.active_work_orders}
          columns={[
            { key: "wo_number", label: "מספר" },
            { key: "project_name", label: "פרויקט" },
            { key: "state", label: "סטטוס" },
            { key: "progress_percent", label: "התקדמות", render: (v) => `${v ?? 0}%` },
          ]}
          onRowClick={(row) => navigate(`/work-order/${row.work_order_id}`)}
        />
      </Section>

      {/* Projects */}
      <Section title="פרויקטים">
        <Table
          rows={data.project_rows}
          columns={[
            { key: "project_number", label: "מספר" },
            { key: "project_name", label: "שם" },
            { key: "state", label: "סטטוס" },
            { key: "progress_percent", label: "התקדמות", render: (v) => `${v ?? 0}%` },
            { key: "blockers_count", label: "חסימות" },
          ]}
          onRowClick={(row) => navigate(`/project/${row.project_id}`)}
        />
      </Section>
    </div>
  );
}

// ── Shared sub-components ──

function Loading({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-64 text-gray-400">
      <div className="animate-pulse text-sm">{label}</div>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="p-4 bg-red-900/20 border border-red-500/40 rounded text-red-300 text-sm">
      שגיאה: {message}
    </div>
  );
}

function KPI({ label, value, color }: { label: string; value: number | string; color?: string }) {
  const colorMap: Record<string, string> = {
    red: "text-red-400",
    yellow: "text-yellow-400",
    green: "text-green-400",
  };
  return (
    <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${colorMap[color ?? ""] ?? "text-white"}`}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-300 mb-3 border-b border-gray-700/50 pb-2">{title}</h2>
      {children}
    </section>
  );
}

interface Column {
  key: string;
  label: string;
  render?: (value: any, row: any) => React.ReactNode;
}

function Table({ rows, columns, onRowClick }: { rows: any[]; columns: Column[]; onRowClick?: (row: any) => void }) {
  if (!rows.length) return <div className="text-gray-500 text-sm py-4 text-center">אין נתונים</div>;
  return (
    <div className="overflow-auto rounded border border-gray-700/50">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-800/50">
            {columns.map((c) => (
              <th key={c.key} className="text-right px-3 py-2 text-xs text-gray-400 font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.id ?? i}
              onClick={() => onRowClick?.(row)}
              className={`border-t border-gray-700/30 ${onRowClick ? "cursor-pointer hover:bg-gray-700/30" : ""}`}
            >
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-2 text-gray-200">
                  {c.render ? c.render(row[c.key], row) : (row[c.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
