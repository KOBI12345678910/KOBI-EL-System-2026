import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";

export default function Customer360() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      const { data: payload, error: err } = await supabase.rpc(
        "get_customer_360_fast",
        { p_customer_id: Number(id) }
      );
      if (err) setError(err.message);
      else setData(payload);
      setLoading(false);
    };
    load();
  }, [id]);

  if (loading) return <Loader label="טוען לקוח..." />;
  if (error) return <ErrCard msg={error} />;
  if (!data) return <ErrCard msg="לא נמצא" />;

  const c = data.customer ?? {};

  return (
    <div className="space-y-6 max-w-6xl">
      {/* ── Header + Status ── */}
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">{c.customer_name ?? `לקוח #${id}`}</h1>
          <p className="text-sm text-gray-400">{c.customer_number} · {c.city}</p>
        </div>
        <StatusBadge state={c.state} />
      </header>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="הצעות מחיר" value={data.quotes?.length ?? 0} />
        <KPI label="פרויקטים" value={data.projects?.length ?? 0} />
        <KPI label="חשבוניות" value={data.invoices?.length ?? 0} />
        <KPI label="מסמכים" value={data.documents?.length ?? 0} />
      </div>

      {/* ── Primary Actions ── */}
      <div className="flex gap-2 flex-wrap">
        <ActionBtn label="הצעת מחיר חדשה" onClick={() => navigate(`/quote/new?customer=${id}`)} />
        <ActionBtn label="פרויקט חדש" onClick={() => navigate(`/project/new?customer=${id}`)} />
        <ActionBtn label="חשבונית חדשה" onClick={() => navigate(`/finance/new?customer=${id}`)} />
      </div>

      {/* ── Related: Quotes ── */}
      <RelatedTable
        title="הצעות מחיר"
        rows={data.quotes ?? []}
        cols={[
          { key: "quote_number", label: "מספר" },
          { key: "quote_date", label: "תאריך" },
          { key: "grand_total", label: "סכום" },
          { key: "state", label: "סטטוס" },
        ]}
        onRowClick={(r) => navigate(`/quote/${r.id}`)}
      />

      {/* ── Related: Projects ── */}
      <RelatedTable
        title="פרויקטים"
        rows={data.projects ?? []}
        cols={[
          { key: "project_number", label: "מספר" },
          { key: "project_name", label: "שם" },
          { key: "state", label: "סטטוס" },
          { key: "progress_percent", label: "%" },
        ]}
        onRowClick={(r) => navigate(`/project/${r.id}`)}
      />

      {/* ── Related: Invoices ── */}
      <RelatedTable
        title="חשבוניות"
        rows={data.invoices ?? []}
        cols={[
          { key: "invoice_number", label: "מספר" },
          { key: "issue_date", label: "תאריך" },
          { key: "grand_total", label: "סכום" },
          { key: "balance_due", label: "יתרה" },
          { key: "state", label: "סטטוס" },
        ]}
      />

      {/* ── Documents ── */}
      <RelatedTable
        title="מסמכים"
        rows={data.documents ?? []}
        cols={[
          { key: "document_number", label: "מספר" },
          { key: "filename", label: "קובץ" },
          { key: "document_type", label: "סוג" },
        ]}
      />

      {/* ── AI Insights ── */}
      {(data.insights?.length ?? 0) > 0 && (
        <Section title="תובנות AI">
          <div className="space-y-2">
            {data.insights.map((ins: any) => (
              <div key={ins.id} className="p-3 bg-blue-900/10 border border-blue-500/30 rounded text-sm">
                <span className="font-medium">{ins.recommendation_text}</span>
                <span className="text-gray-400 mr-2 text-xs">ביטחון: {Math.round((ins.confidence_score ?? 0) * 100)}%</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Audit Log ── */}
      <Section title="יומן פעילות">
        {(data.audit?.length ?? 0) === 0 ? (
          <p className="text-gray-500 text-sm">אין רשומות</p>
        ) : (
          <div className="space-y-1 max-h-48 overflow-auto">
            {data.audit.map((a: any) => (
              <div key={a.id} className="flex gap-3 text-xs text-gray-400 py-1 border-b border-gray-800/30">
                <span className="text-gray-500 w-32 shrink-0">{a.performed_at?.slice(0, 16)?.replace("T", " ")}</span>
                <span>{a.action_name}</span>
                <span className="mr-auto">{a.performed_by_user_name}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ── Shared sub-components for all 360 pages ──

function Loader({ label }: { label: string }) {
  return <div className="flex items-center justify-center h-64 text-gray-400 animate-pulse text-sm">{label}</div>;
}
function ErrCard({ msg }: { msg: string }) {
  return <div className="p-4 bg-red-900/20 border border-red-500/40 rounded text-red-300 text-sm">שגיאה: {msg}</div>;
}
function StatusBadge({ state }: { state?: string }) {
  const colors: Record<string, string> = {
    Active: "bg-green-600/20 text-green-300 border-green-500/40",
    Draft: "bg-gray-600/20 text-gray-300 border-gray-500/40",
    Closed: "bg-red-600/20 text-red-300 border-red-500/40",
  };
  return (
    <span className={`px-3 py-1 rounded text-xs border ${colors[state ?? ""] ?? colors.Draft}`}>
      {state ?? "—"}
    </span>
  );
}
function KPI({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
function ActionBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium transition-colors">
      + {label}
    </button>
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
function RelatedTable({ title, rows, cols, onRowClick }: { title: string; rows: any[]; cols: { key: string; label: string }[]; onRowClick?: (r: any) => void }) {
  return (
    <Section title={`${title} (${rows.length})`}>
      {rows.length === 0 ? (
        <p className="text-gray-500 text-sm">אין רשומות</p>
      ) : (
        <div className="overflow-auto rounded border border-gray-700/50">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-800/50">{cols.map(c => <th key={c.key} className="text-right px-3 py-2 text-xs text-gray-400 font-medium">{c.label}</th>)}</tr></thead>
            <tbody>
              {rows.slice(0, 20).map((r, i) => (
                <tr key={r.id ?? i} onClick={() => onRowClick?.(r)} className={`border-t border-gray-700/30 ${onRowClick ? "cursor-pointer hover:bg-gray-700/30" : ""}`}>
                  {cols.map(c => <td key={c.key} className="px-3 py-2 text-gray-200">{r[c.key] ?? "—"}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
