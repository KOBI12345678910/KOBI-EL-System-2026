import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";

interface ProcurementData {
  summary: Record<string, any>;
  rfqs: any[];
  approvals: any[];
  overdue_pos: any[];
  supplier_risks: any[];
  receiving_today: any[];
}

export default function ProcurementControlRoom() {
  const [data, setData] = useState<ProcurementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: payload, error: err } = await supabase.rpc(
        "get_procurement_control_room_fast"
      );
      if (err) setError(err.message);
      else setData(payload);
      setLoading(false);
    };
    load();
  }, []);

  if (loading)
    return <div className="flex items-center justify-center h-64 text-gray-400 animate-pulse text-sm">טוען חדר בקרה — רכש...</div>;
  if (error)
    return <div className="p-4 bg-red-900/20 border border-red-500/40 rounded text-red-300 text-sm">שגיאה: {error}</div>;
  if (!data) return null;

  const s = data.summary ?? {};

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">חדר בקרה — רכש</h1>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="בקשות הצעת מחיר" value={data.rfqs.length} />
        <KPI label="ממתינות לאישור" value={data.approvals.length} color="yellow" />
        <KPI label="הזמנות באיחור" value={data.overdue_pos.length} color={data.overdue_pos.length > 0 ? "red" : "green"} />
        <KPI label="קבלות היום" value={data.receiving_today.length} />
      </div>

      {/* Pending approvals */}
      {data.approvals.length > 0 && (
        <Section title="ממתינות לאישור">
          <div className="space-y-2">
            {data.approvals.map((a: any, i: number) => (
              <div
                key={a.id ?? i}
                className="p-3 bg-yellow-900/10 border border-yellow-500/30 rounded text-sm cursor-pointer hover:bg-yellow-900/20"
                onClick={() => a.po_id && navigate(`/po/${a.po_id}`)}
              >
                <span className="font-medium">{a.po_number ?? `אישור #${i + 1}`}</span>
                <span className="text-gray-400 mr-2 text-xs">{a.requested_at?.slice(0, 10)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Overdue POs */}
      {data.overdue_pos.length > 0 && (
        <Section title="הזמנות רכש באיחור">
          <Table
            rows={data.overdue_pos}
            columns={[
              { key: "po_number", label: "מספר PO" },
              { key: "supplier_name", label: "ספק" },
              { key: "expected_delivery_date", label: "תאריך צפוי" },
              { key: "state", label: "סטטוס" },
            ]}
            onRowClick={(row) => navigate(`/po/${row.po_id ?? row.id}`)}
          />
        </Section>
      )}

      {/* RFQs */}
      <Section title="בקשות הצעת מחיר פתוחות">
        <Table
          rows={data.rfqs}
          columns={[
            { key: "rfq_number", label: "מספר" },
            { key: "title", label: "נושא" },
            { key: "response_deadline", label: "מועד אחרון" },
            { key: "state", label: "סטטוס" },
          ]}
          onRowClick={(row) => navigate(`/rfq/${row.rfq_id ?? row.id}`)}
        />
      </Section>

      {/* Supplier risks */}
      {data.supplier_risks.length > 0 && (
        <Section title="ספקים בסיכון">
          <Table
            rows={data.supplier_risks}
            columns={[
              { key: "supplier_name", label: "ספק" },
              { key: "risk_level", label: "רמת סיכון" },
              { key: "overall_score", label: "ציון" },
            ]}
            onRowClick={(row) => navigate(`/supplier/${row.supplier_id ?? row.id}`)}
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
