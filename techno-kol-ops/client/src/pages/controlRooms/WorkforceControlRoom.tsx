import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";

interface WorkforceData {
  summary: Record<string, any>;
  missing_attendance: any[];
  payroll_runs: any[];
  overtime_alerts: any[];
  expenses: any[];
  leave_requests: any[];
}

export default function WorkforceControlRoom() {
  const [data, setData] = useState<WorkforceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: payload, error: err } = await supabase.rpc(
        "get_workforce_control_room_fast"
      );
      if (err) setError(err.message);
      else setData(payload);
      setLoading(false);
    };
    load();
  }, []);

  if (loading)
    return <div className="flex items-center justify-center h-64 text-gray-400 animate-pulse text-sm">טוען חדר בקרה — כח אדם...</div>;
  if (error)
    return <div className="p-4 bg-red-900/20 border border-red-500/40 rounded text-red-300 text-sm">שגיאה: {error}</div>;
  if (!data) return null;

  const s = data.summary ?? {};

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">חדר בקרה — כח אדם</h1>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="חסרי נוכחות" value={data.missing_attendance.length} color={data.missing_attendance.length > 0 ? "red" : "green"} />
        <KPI label="ריצות שכר" value={data.payroll_runs.length} />
        <KPI label="שעות נוספות" value={data.overtime_alerts.length} color={data.overtime_alerts.length > 5 ? "yellow" : undefined} />
        <KPI label="בקשות חופשה" value={data.leave_requests.length} />
      </div>

      {/* Missing attendance */}
      {data.missing_attendance.length > 0 && (
        <Section title="חסרי נוכחות היום">
          <Table
            rows={data.missing_attendance}
            columns={[
              { key: "employee_number", label: "מספר עובד" },
              { key: "full_name", label: "שם" },
              { key: "department", label: "מחלקה" },
            ]}
            onRowClick={(row) => navigate(`/employee/${row.employee_id ?? row.id}`)}
          />
        </Section>
      )}

      {/* Overtime alerts */}
      {data.overtime_alerts.length > 0 && (
        <Section title="התראות שעות נוספות">
          <Table
            rows={data.overtime_alerts}
            columns={[
              { key: "employee_name", label: "עובד" },
              { key: "overtime_hours", label: "שעות נוספות" },
              { key: "period", label: "תקופה" },
            ]}
            onRowClick={(row) => navigate(`/employee/${row.employee_id ?? row.id}`)}
          />
        </Section>
      )}

      {/* Leave requests */}
      {data.leave_requests.length > 0 && (
        <Section title="בקשות חופשה">
          <Table
            rows={data.leave_requests}
            columns={[
              { key: "employee_name", label: "עובד" },
              { key: "leave_type", label: "סוג" },
              { key: "start_date", label: "מתאריך" },
              { key: "end_date", label: "עד" },
              { key: "state", label: "סטטוס" },
            ]}
          />
        </Section>
      )}

      {/* Payroll runs */}
      <Section title="ריצות שכר">
        <Table
          rows={data.payroll_runs}
          columns={[
            { key: "payroll_period_end", label: "תקופה" },
            { key: "state", label: "סטטוס" },
            { key: "employee_count", label: "עובדים" },
            { key: "total_gross", label: "ברוטו כולל" },
          ]}
        />
      </Section>

      {/* Expenses */}
      {data.expenses.length > 0 && (
        <Section title="הוצאות אחרונות">
          <Table
            rows={data.expenses.slice(0, 20)}
            columns={[
              { key: "employee_name", label: "עובד" },
              { key: "expense_date", label: "תאריך" },
              { key: "amount", label: "סכום" },
              { key: "category", label: "קטגוריה" },
              { key: "state", label: "סטטוס" },
            ]}
          />
        </Section>
      )}
    </div>
  );
}

// ── Shared sub-components ──

function KPI({ label, value, color }: { label: string; value: number | string; color?: string }) {
  const colorMap: Record<string, string> = { red: "text-red-400", yellow: "text-yellow-400", green: "text-green-400" };
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

function Table({ rows, columns, onRowClick }: { rows: any[]; columns: { key: string; label: string }[]; onRowClick?: (row: any) => void }) {
  if (!rows.length) return <div className="text-gray-500 text-sm py-4 text-center">אין נתונים</div>;
  return (
    <div className="overflow-auto rounded border border-gray-700/50">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-800/50">
            {columns.map((c) => (
              <th key={c.key} className="text-right px-3 py-2 text-xs text-gray-400 font-medium">{c.label}</th>
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
                <td key={c.key} className="px-3 py-2 text-gray-200">{row[c.key] ?? "—"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
