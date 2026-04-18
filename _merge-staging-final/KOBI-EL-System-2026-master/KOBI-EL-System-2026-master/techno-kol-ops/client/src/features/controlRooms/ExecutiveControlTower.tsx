import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";

/**
 * Executive Control Tower — CEO-level dashboard.
 * Aggregates KPIs from all three domains: Operations, Procurement, Workforce.
 */
export default function ExecutiveControlTower() {
  const navigate = useNavigate();
  const [ops, setOps] = useState<any>(null);
  const [proc, setProc] = useState<any>(null);
  const [wf, setWf] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [r1, r2, r3] = await Promise.allSettled([
        supabase.rpc("get_operations_control_room_fast"),
        supabase.rpc("get_procurement_control_room_fast"),
        supabase.rpc("get_workforce_control_room_fast"),
      ]);
      if (r1.status === "fulfilled" && !r1.value.error) setOps(r1.value.data);
      if (r2.status === "fulfilled" && !r2.value.error) setProc(r2.value.data);
      if (r3.status === "fulfilled" && !r3.value.error) setWf(r3.value.data);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 animate-pulse text-sm">
        טוען מגדל בקרה...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold">מגדל בקרה — מנכ״ל</h1>

      {/* ── Top-level KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPI label="הזמנות עבודה פעילות" value={ops?.active_work_orders?.length ?? "—"} onClick={() => navigate("/operations")} />
        <KPI label="באיחור" value={ops?.delayed_work_orders?.length ?? 0} color="red" onClick={() => navigate("/operations")} />
        <KPI label="RFQs פתוחים" value={proc?.rfqs?.length ?? "—"} onClick={() => navigate("/procurement")} />
        <KPI label="POs באיחור" value={proc?.overdue_pos?.length ?? 0} color={Number(proc?.overdue_pos?.length ?? 0) > 0 ? "red" : "green"} onClick={() => navigate("/procurement")} />
        <KPI label="חסרי נוכחות" value={wf?.missing_attendance?.length ?? 0} color={Number(wf?.missing_attendance?.length ?? 0) > 0 ? "yellow" : "green"} onClick={() => navigate("/workforce")} />
        <KPI label="התראות פתוחות" value={ops?.alerts?.length ?? 0} color={Number(ops?.alerts?.length ?? 0) > 5 ? "red" : undefined} />
      </div>

      {/* ── Domain cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <DomainCard
          title="תפעול"
          onClick={() => navigate("/operations")}
          items={[
            { label: "הזמנות פעילות", value: ops?.active_work_orders?.length ?? 0 },
            { label: "משימות פתוחות", value: ops?.open_tasks?.length ?? 0 },
            { label: "מחסור חומרים", value: ops?.shortages?.length ?? 0 },
            { label: "פרויקטים", value: ops?.project_rows?.length ?? 0 },
          ]}
        />
        <DomainCard
          title="רכש"
          onClick={() => navigate("/procurement")}
          items={[
            { label: "ממתינות לאישור", value: proc?.approvals?.length ?? 0 },
            { label: "ספקים בסיכון", value: proc?.supplier_risks?.length ?? 0 },
            { label: "קבלות היום", value: proc?.receiving_today?.length ?? 0 },
          ]}
        />
        <DomainCard
          title="כח אדם"
          onClick={() => navigate("/workforce")}
          items={[
            { label: "ריצות שכר", value: wf?.payroll_runs?.length ?? 0 },
            { label: "שעות נוספות", value: wf?.overtime_alerts?.length ?? 0 },
            { label: "בקשות חופשה", value: wf?.leave_requests?.length ?? 0 },
          ]}
        />
      </div>

      {/* ── Critical Alerts ── */}
      {(ops?.alerts?.length ?? 0) > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-300 mb-3 border-b border-gray-700/50 pb-2">
            התראות קריטיות
          </h2>
          <div className="space-y-2">
            {ops.alerts.filter((a: any) => a.severity === "Critical").slice(0, 5).map((a: any) => (
              <div key={a.id} className="p-3 bg-red-900/20 border border-red-500/40 rounded text-sm">
                <span className="font-medium">{a.title}</span>
                <span className="text-gray-400 mr-2 text-xs">#{a.alert_number}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Sub-components ──

function KPI({ label, value, color, onClick }: { label: string; value: number | string; color?: string; onClick?: () => void }) {
  const colorMap: Record<string, string> = { red: "text-red-400", yellow: "text-yellow-400", green: "text-green-400" };
  return (
    <div
      onClick={onClick}
      className={`bg-gray-800/50 rounded-lg p-4 border border-gray-700/50 ${onClick ? "cursor-pointer hover:bg-gray-700/40 transition-colors" : ""}`}
    >
      <div className="text-[10px] text-gray-400 mb-1 uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-bold ${colorMap[color ?? ""] ?? "text-white"}`}>{value}</div>
    </div>
  );
}

function DomainCard({ title, onClick, items }: { title: string; onClick: () => void; items: { label: string; value: number }[] }) {
  return (
    <div
      onClick={onClick}
      className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-5 cursor-pointer hover:bg-gray-700/30 transition-colors"
    >
      <h3 className="font-semibold mb-4 text-sm">{title}</h3>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex justify-between text-sm">
            <span className="text-gray-400">{item.label}</span>
            <span className="font-medium">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
